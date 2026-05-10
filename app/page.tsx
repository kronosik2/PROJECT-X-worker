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
      .select('*, order:orders(*)')
      .eq('worker_id', workerId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Ошибка загрузки откликов:', error);
      return;
    }
    
    if (data) {
      const formatted = data.map((r: any) => ({
        id: r.id,
        status: r.status,
        price_offer: r.price_offer,
        comment: r.comment,
        created_at: r.created_at,
        order: r.order
      }));
      setMyOrders(formatted);
    }
  }

  async function respondToOrder(orderId: string, workersCount: number) {
    if (!worker) return;
    
    setResponding(orderId);
    
    // Получаем заказ
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
    
    // Стоимость за одного человека
    const pricePerPerson = order.price / (order.workers_count || 1);
    // Резерв за одного человека (10%, мин. 200₽)
    const reservePerPerson = Math.max(Math.ceil(pricePerPerson * 0.1), 200);
    // Общий резерв за выбранное количество человек
    const totalReserve = reservePerPerson * workersCount;
    
    // Проверяем баланс
    if (balance < totalReserve) {
      alert(`❌ Недостаточно средств. Нужно ${totalReserve}₽ для резерва (${workersCount} чел. × ${reservePerPerson}₽)`);
      setResponding(null);
      return;
    }
    
    const priceOffer = prompt(`Ваша цена за ${workersCount} чел. (₽):`, (pricePerPerson * workersCount).toString());
    if (!priceOffer) {
      setResponding(null);
      return;
    }
    
    const comment = prompt('Комментарий для клиента (необязательно):');
    
    const { data, error } = await supabase.rpc('respond_to_order', {
      p_order_id: orderId,
      p_worker_id: worker.id,
      p_price_offer: parseInt(priceOffer),
      p_comment: comment || '',
      p_workers_count: workersCount
    });
    
    setResponding(null);
    
    if (error) {
      alert('Ошибка: ' + error.message);
    } else if (data && data.success === false) {
      alert(data.error);
    } else {
      alert(`✅ Отклик отправлен! Зарезервировано ${totalReserve}₽ (${workersCount} чел.)`);
      // Обновляем баланс
      const { data: updated } = await supabase
        .from('workers')
        .select('balance, reserved')
        .eq('id', worker.id)
        .single();
      if (updated) {
        setBalance(updated.balance - updated.reserved);
      }
      await loadFeedOrders();
      await loadMyOrders(worker.id);
    }
  }

  async function confirmOrder(responseId: string, orderId: string) {
    const { error } = await supabase.rpc('confirm_order', {
      p_order_id: orderId,
      p_worker_id: worker.id
    });
    
    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      alert('✅ Заказ подтверждён!');
      await loadMyOrders(worker.id);
      await loadFeedOrders();
    }
  }

  async function completeOrder(responseId: string, orderId: string) {
    if (!confirm('Завершить заказ?')) return;
    
    const { error } = await supabase.rpc('complete_order', {
      p_order_id: orderId,
      p_user_id: worker.id,
      p_role: 'worker'
    });
    
    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      alert('✅ Заказ завершён! Средства зачислены');
      const { data: updated } = await supabase
        .from('workers')
        .select('balance, reserved')
        .eq('id', worker.id)
        .single();
      if (updated) {
        setBalance(updated.balance - updated.reserved);
      }
      await loadMyOrders(worker.id);
      await loadFeedOrders();
    }
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
          {/* Шапка */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold">👷 ПРОЕКТ X</h1>
                <p className="text-gray-600">Исполнитель: {worker.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">💰 Доступно</p>
                <p className="text-2xl font-bold text-blue-600">{balance} ₽</p>
                <p className="text-xs text-gray-500">Зарезервировано: {worker.reserved || 0} ₽</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Выйти
              </button>
            </div>
          </div>

          {/* Табы */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('feed')}
              className={`flex-1 py-3 rounded-xl font-semibold transition ${activeTab === 'feed' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              📋 Лента заказов ({feedOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('my')}
              className={`flex-1 py-3 rounded-xl font-semibold transition ${activeTab === 'my' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              📦 Мои заказы ({myOrders.length})
            </button>
          </div>

          {/* Лента заказов */}
          {activeTab === 'feed' && (
            <div className="space-y-4">
              {feedOrders.length === 0 && (
                <div className="bg-white rounded-xl p-12 text-center">
                  <p className="text-gray-500">Нет доступных заказов</p>
                </div>
              )}
              {feedOrders.map((order) => (
                <div key={order.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg">{order.title}</h3>
                      <p className="text-gray-600 text-sm mt-1">{order.description}</p>
                    </div>
                    <span className="status-badge status-pending">Ожидает</span>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <p className="text-gray-600">
                      📍 
                      <a 
                        href={`https://yandex.ru/maps/?text=${order.address}, ${order.city}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline ml-1"
                      >
                        {order.address}, {order.city}
                      </a>
                    </p>
                    <p className="text-gray-600">👥 Требуется: {order.workers_count || 1} чел.</p>
                    <p className="text-gray-600">💰 Бюджет: {order.price} ₽</p>
                    <p className="text-gray-500 text-xs">📅 {new Date(order.time_slot).toLocaleString()}</p>
                  </div>
                  
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => respondToOrder(order.id, 1)}
                      disabled={responding === order.id}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {responding === order.id ? 'Отправка...' : '🚶 Еду один'}
                    </button>
                    <button
                      onClick={() => respondToOrder(order.id, 2)}
                      disabled={responding === order.id}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {responding === order.id ? 'Отправка...' : '👥 Еду с напарником'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Мои заказы */}
          {activeTab === 'my' && (
            <div className="space-y-4">
              {myOrders.length === 0 && (
                <div className="bg-white rounded-xl p-12 text-center">
                  <p className="text-gray-500">У вас пока нет откликов</p>
                </div>
              )}
              {myOrders.map((item) => {
                const order = item.order;
                if (!order) return null;
                
                let statusText = '', statusClass = '', buttons = null;
                
                if (item.status === 'pending') {
                  statusText = '⏳ Ожидает ответа клиента';
                  statusClass = 'status-pending';
                  buttons = null;
                } else if (item.status === 'approved') {
                  statusText = '✅ Клиент выбрал вас! Подтвердите';
                  statusClass = 'status-approved';
                  buttons = (
                    <button
                      onClick={() => confirmOrder(item.id, order.id)}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                    >
                      ✅ Подтвердить заказ
                    </button>
                  );
                } else if (item.status === 'confirmed') {
                  statusText = '🚚 В работе';
                  statusClass = 'status-confirmed';
                  buttons = (
                    <button
                      onClick={() => completeOrder(item.id, order.id)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                      🏁 Завершить заказ
                    </button>
                  );
                } else if (item.status === 'completed') {
                  statusText = '✅ Выполнен';
                  statusClass = 'status-completed';
                  buttons = null;
                } else if (item.status === 'cancelled') {
                  statusText = '❌ Отменён';
                  statusClass = 'status-cancelled';
                  buttons = null;
                }
                
                return (
                  <div key={item.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-bold text-lg">Заказ #{order.id.slice(0, 8)}</h3>
                      <span className={`status-badge ${statusClass}`}>{statusText}</span>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-600">
                        📍 
                        <a 
                          href={`https://yandex.ru/maps/?text=${order.address}, ${order.city}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline ml-1"
                        >
                          {order.address}, {order.city}
                        </a>
                      </p>
                      <p className="text-gray-600">💰 Ваша цена: {item.price_offer} ₽</p>
                      {item.comment && <p className="text-gray-500 text-sm">💬 {item.comment}</p>}
                    </div>
                    
                    {buttons && <div className="mt-4">{buttons}</div>}
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
