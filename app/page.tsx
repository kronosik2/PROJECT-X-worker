'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AuthModal from '@/components/AuthModal';

export default function WorkerPage() {
  const [worker, setWorker] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'my'>('feed');
  const [feedOrders, setFeedOrders] = useState<any[]>([]);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('worker_id');
    if (saved) {
      supabase.from('workers').select('*').eq('id', saved).single()
        .then(({ data }) => {
          if (data) {
            setWorker(data);
            setBalance((data.balance || 0) - (data.reserved || 0));
            loadFeedOrders();
            loadMyOrders(data.id);
          }
          setLoading(false);
        });
    } else {
      setLoading(false);
      setShowAuthModal(true);
    }
  }, []);

  async function loadFeedOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setFeedOrders(data || []);
  }

  async function loadMyOrders(workerId: string) {
    const { data, error } = await supabase
      .from('responses')
      .select(`
        id,
        status,
        price_offer,
        comment,
        created_at,
        order:orders (
          id,
          title,
          description,
          address,
          city,
          price,
          workers_count,
          status
        )
      `)
      .eq('worker_id', workerId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Ошибка загрузки откликов:', error);
      return;
    }
    
    if (data) {
      setMyOrders(data);
    }
  }

  async function respondToOrder(orderId: string, workersCount: number) {
    if (!worker) return;
    
    setResponding(orderId);
    
    // Получаем цену заказа через отдельный запрос
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('price, workers_count')
      .eq('id', orderId)
      .single();
    
    if (orderError || !order) {
      alert('Ошибка получения заказа');
      setResponding(null);
      return;
    }
    
    // Простой расчёт резерва
    const pricePerPerson = order.price / (order.workers_count || 1);
    const reservePerPerson = Math.max(Math.ceil(pricePerPerson * 0.1), 200);
    const totalReserve = reservePerPerson * workersCount;
    
    if (balance < totalReserve) {
      alert(`Недостаточно средств. Нужно ${totalReserve}₽`);
      setResponding(null);
      return;
    }
    
    const priceOffer = prompt('Ваша цена (₽):', order.price.toString());
    if (!priceOffer) {
      setResponding(null);
      return;
    }
    
    const comment = prompt('Комментарий (необязательно):');
    
    // Прямая вставка отклика через insert
    const { error } = await supabase
      .from('responses')
      .insert({
        order_id: orderId,
        worker_id: worker.id,
        price_offer: parseInt(priceOffer),
        comment: comment || '',
        hold_amount: totalReserve,
        status: 'pending'
      });
    
    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      // Обновляем резерв в workers
      await supabase
        .from('workers')
        .update({ reserved: (worker.reserved || 0) + totalReserve })
        .eq('id', worker.id);
      
      alert(`✅ Отклик отправлен! Зарезервировано ${totalReserve}₽`);
      
      // Обновляем данные
      const { data: updated } = await supabase
        .from('workers')
        .select('balance, reserved')
        .eq('id', worker.id)
        .single();
      if (updated) {
        setWorker({ ...worker, ...updated });
        setBalance(updated.balance - updated.reserved);
      }
      
      await loadFeedOrders();
      await loadMyOrders(worker.id);
    }
    
    setResponding(null);
  }

  async function confirmOrder(responseId: string, orderId: string) {
    await supabase
      .from('responses')
      .update({ status: 'confirmed' })
      .eq('id', responseId);
    
    await supabase
      .from('orders')
      .update({ status: 'confirmed' })
      .eq('id', orderId);
    
    alert('✅ Заказ подтверждён!');
    await loadMyOrders(worker.id);
    await loadFeedOrders();
  }

  async function completeOrder(responseId: string, orderId: string) {
    if (!confirm('Завершить заказ?')) return;
    
    // Получаем сумму заказа
    const { data: order } = await supabase
      .from('orders')
      .select('price')
      .eq('id', orderId)
      .single();
    
    if (order) {
      // Зачисляем деньги исполнителю
      await supabase
        .from('workers')
        .update({ 
          balance: (worker.balance || 0) + order.price,
          reserved: (worker.reserved || 0) - (worker.reserved || 0)
        })
        .eq('id', worker.id);
      
      await supabase
        .from('responses')
        .update({ status: 'completed' })
        .eq('id', responseId);
      
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('id', orderId);
      
      alert('✅ Заказ завершён! Средства зачислены');
      
      // Обновляем данные
      const { data: updated } = await supabase
        .from('workers')
        .select('balance, reserved')
        .eq('id', worker.id)
        .single();
      if (updated) {
        setWorker({ ...worker, ...updated });
        setBalance(updated.balance - updated.reserved);
      }
    }
    
    await loadMyOrders(worker.id);
    await loadFeedOrders();
  }

  function handleLogin(worker: any) {
    setWorker(worker);
    setBalance((worker.balance || 0) - (worker.reserved || 0));
    setShowAuthModal(false);
    loadFeedOrders();
    loadMyOrders(worker.id);
  }

  function handleLogout() {
    setWorker(null);
    localStorage.removeItem('worker_id');
    setShowAuthModal(true);
  }

  if (loading) return <div className="text-center py-20">Загрузка...</div>;

  return (
    <>
      {showAuthModal && <AuthModal role="worker" onLogin={handleLogin} />}
      
      {worker && (
        <div className="max-w-4xl mx-auto p-4">
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold">👷 ПРОЕКТ X</h1>
                <p className="text-gray-600">{worker.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">💰 Доступно</p>
                <p className="text-2xl font-bold text-blue-600">{balance} ₽</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Выйти
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('feed')}
              className={`flex-1 py-3 rounded-xl font-semibold transition ${activeTab === 'feed' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              📋 Лента ({feedOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('my')}
              className={`flex-1 py-3 rounded-xl font-semibold transition ${activeTab === 'my' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              📦 Мои ({myOrders.length})
            </button>
          </div>

          {activeTab === 'feed' && (
            <div className="space-y-4">
              {feedOrders.length === 0 && (
                <div className="bg-white rounded-xl p-12 text-center">
                  <p className="text-gray-500">Нет доступных заказов</p>
                </div>
              )}
              {feedOrders.map((order) => (
                <div key={order.id} className="bg-white rounded-xl p-5 shadow-sm border">
                  <h3 className="font-bold text-lg">{order.title}</h3>
                  <p className="text-gray-600 text-sm mt-1">{order.description}</p>
                  <p className="text-sm text-gray-500 mt-2">
                    <a 
                      href={`https://yandex.ru/maps/?text=${order.address}, ${order.city}`} 
                      target="_blank" 
                      className="text-blue-600 hover:underline"
                    >
                      📍 {order.address}, {order.city}
                    </a>
                  </p>
                  <p className="text-sm text-gray-600 mt-1">👥 {order.workers_count || 1} чел.</p>
                  <p className="text-xl font-bold text-blue-600 mt-2">{order.price} ₽</p>
                  
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => respondToOrder(order.id, 1)}
                      disabled={responding === order.id}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg disabled:opacity-50"
                    >
                      🚶 Еду один
                    </button>
                    <button
                      onClick={() => respondToOrder(order.id, 2)}
                      disabled={responding === order.id}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50"
                    >
                      👥 Еду с напарником
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'my' && (
            <div className="space-y-4">
              {myOrders.length === 0 && (
                <div className="bg-white rounded-xl p-12 text-center">
                  <p className="text-gray-500">У вас пока нет откликов</p>
                </div>
              )}
              {myOrders.map((item: any) => {
                const order = item.order;
                if (!order) return null;
                
                let statusText = '', statusClass = '', buttons = null;
                
                if (item.status === 'pending') {
                  statusText = '⏳ Ожидает ответа';
                  statusClass = 'status-pending';
                } else if (item.status === 'confirmed') {
                  statusText = '🚚 В работе';
                  statusClass = 'status-confirmed';
                  buttons = (
                    <button
                      onClick={() => completeOrder(item.id, order.id)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg"
                    >
                      Завершить
                    </button>
                  );
                } else if (item.status === 'completed') {
                  statusText = '✅ Выполнен';
                  statusClass = 'status-completed';
                }
                
                return (
                  <div key={item.id} className="bg-white rounded-xl p-5 shadow-sm border">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold">Заказ #{order.id.slice(0, 8)}</h3>
                      <span className={`status-badge ${statusClass}`}>{statusText}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      <a href={`https://yandex.ru/maps/?text=${order.address}, ${order.city}`} target="_blank" className="text-blue-600 hover:underline">
                        📍 {order.address}, {order.city}
                      </a>
                    </p>
                    <p className="text-sm text-gray-600 mt-1">💰 {item.price_offer} ₽</p>
                    {buttons && <div className="mt-3">{buttons}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
