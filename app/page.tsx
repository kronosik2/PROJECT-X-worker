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
  const [reserved, setReserved] = useState(0);
  const [responding, setResponding] = useState<string | null>(null);
  const [activeResponses, setActiveResponses] = useState(0);
  const [activeOrders, setActiveOrders] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('worker_id');
    if (saved) {
      supabase.from('workers').select('*').eq('id', saved).single()
        .then(({ data }) => {
          if (data) {
            setWorker(data);
            setBalance(data.balance || 0);
            setReserved(data.reserved || 0);
            setActiveResponses(data.active_responses || 0);
            setActiveOrders(data.active_orders || 0);
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
        hold_amount,
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
    
    // Проверка лимитов
    if (activeResponses >= 3) {
      alert('❌ Вы уже откликнулись на 3 заказа. Дождитесь ответа клиента.');
      return;
    }
    if (activeOrders >= 1) {
      alert('❌ У вас уже есть активный заказ. Завершите его, чтобы взять новый.');
      return;
    }
    
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
    
    // Доступные средства (баланс - уже зарезервированные)
    const availableBalance = balance - reserved;
    
    if (availableBalance < totalReserve) {
      alert(`❌ Недостаточно средств. Доступно: ${availableBalance}₽, нужно: ${totalReserve}₽`);
      setResponding(null);
      return;
    }
    
    const priceOffer = prompt(`Ваша цена за ${workersCount} чел. (₽):`, (pricePerPerson * workersCount).toString());
    if (!priceOffer) {
      setResponding(null);
      return;
    }
    
    const comment = prompt('Комментарий (необязательно):');
    
    // Создаём отклик
    const { error: insertError } = await supabase
      .from('responses')
      .insert({
        order_id: orderId,
        worker_id: worker.id,
        price_offer: parseInt(priceOffer),
        comment: comment || '',
        hold_amount: totalReserve,
        status: 'pending',
        workers_count: workersCount
      });
    
    if (insertError) {
      alert('Ошибка: ' + insertError.message);
      setResponding(null);
      return;
    }
    
    // Обновляем резерв и счётчики
    const newReserved = (worker.reserved || 0) + totalReserve;
    const newActiveResponses = activeResponses + 1;
    
    await supabase
      .from('workers')
      .update({ 
        reserved: newReserved,
        active_responses: newActiveResponses,
        responses_count: (worker.responses_count || 0) + 1
      })
      .eq('id', worker.id);
    
    alert(`✅ Отклик отправлен! Зарезервировано ${totalReserve}₽ (${workersCount} чел.)`);
    
    // Обновляем локальное состояние
    setWorker({ ...worker, reserved: newReserved });
    setReserved(newReserved);
    setActiveResponses(newActiveResponses);
    
    await loadFeedOrders();
    await loadMyOrders(worker.id);
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
    
    // Обновляем счётчики
    const newActiveResponses = activeResponses - 1;
    const newActiveOrders = activeOrders + 1;
    
    await supabase
      .from('workers')
      .update({ 
        active_responses: newActiveResponses,
        active_orders: newActiveOrders,
        orders_count: (worker.orders_count || 0) + 1
      })
      .eq('id', worker.id);
    
    setActiveResponses(newActiveResponses);
    setActiveOrders(newActiveOrders);
    
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
      const newBalance = (worker.balance || 0) + order.price;
      const newReserved = (worker.reserved || 0) - (worker.reserved || 0);
      const newActiveOrders = activeOrders - 1;
      
      await supabase
        .from('workers')
        .update({ 
          balance: newBalance,
          reserved: newReserved,
          active_orders: newActiveOrders,
          completed_count: (worker.completed_count || 0) + 1,
          total_earned: (worker.total_earned || 0) + order.price
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
      
      setBalance(newBalance);
      setReserved(0);
      setActiveOrders(newActiveOrders);
      setWorker({ ...worker, balance: newBalance, reserved: 0 });
      
      alert(`✅ Заказ завершён! Зачислено ${order.price}₽`);
    }
    
    await loadMyOrders(worker.id);
    await loadFeedOrders();
  }

  function handleLogin(worker: any) {
    setWorker(worker);
    setBalance(worker.balance || 0);
    setReserved(worker.reserved || 0);
    setActiveResponses(worker.active_responses || 0);
    setActiveOrders(worker.active_orders || 0);
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
                <p className="text-sm text-gray-600">💰 Баланс</p>
                <p className="text-2xl font-bold text-blue-600">{balance} ₽</p>
                <p className="text-xs text-gray-500">Зарезервировано: {reserved} ₽</p>
                <p className="text-xs text-gray-500">Доступно: {balance - reserved} ₽</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">📊 Лимиты</p>
                <p className="text-sm">Отклики: {activeResponses}/3</p>
                <p className="text-sm">Активных заказов: {activeOrders}/1</p>
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
              {feedOrders.map((order) => {
                const pricePerPerson = order.price / (order.workers_count || 1);
                const reservePerPerson = Math.max(Math.ceil(pricePerPerson * 0.1), 200);
                
                return (
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
                    <p className="text-sm text-gray-600 mt-1">👥 Требуется: {order.workers_count || 1} чел.</p>
                    <p className="text-sm text-gray-600">💰 Общий бюджет: {order.price} ₽</p>
                    <p className="text-sm text-gray-500">💰 За 1 человека: {pricePerPerson} ₽</p>
                    <p className="text-sm text-gray-500">🔒 Резерв за 1 чел: {reservePerPerson} ₽</p>
                    
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={() => respondToOrder(order.id, 1)}
                        disabled={responding === order.id}
                        className="flex-1 bg-green-600 text-white py-2 rounded-lg disabled:opacity-50"
                      >
                        🚶 Еду один ({reservePerPerson}₽ резерв)
                      </button>
                      <button
                        onClick={() => respondToOrder(order.id, 2)}
                        disabled={responding === order.id}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50"
                      >
                        👥 Еду с напарником ({reservePerPerson * 2}₽ резерв)
                      </button>
                    </div>
                  </div>
                );
              })}
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
                  statusText = '⏳ На рассмотрении';
                  statusClass = 'status-pending';
                } else if (item.status === 'approved') {
                  statusText = '✅ Выбран клиентом! Подтвердите';
                  statusClass = 'status-approved';
                  buttons = (
                    <button
                      onClick={() => confirmOrder(item.id, order.id)}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg"
                    >
                      Подтвердить заказ
                    </button>
                  );
                } else if (item.status === 'confirmed') {
                  statusText = '🚚 В работе';
                  statusClass = 'status-confirmed';
                  buttons = (
                    <button
                      onClick={() => completeOrder(item.id, order.id)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg"
                    >
                      Завершить заказ
                    </button>
                  );
                } else if (item.status === 'completed') {
                  statusText = '✅ Выполнен';
                  statusClass = 'status-completed';
                } else if (item.status === 'rejected') {
                  statusText = '❌ Отклонён';
                  statusClass = 'status-cancelled';
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
                    <p className="text-sm text-gray-600 mt-1">💰 Ваша цена: {item.price_offer} ₽</p>
                    <p className="text-sm text-gray-600">🔒 Зарезервировано: {item.hold_amount} ₽</p>
                    {item.comment && <p className="text-sm text-gray-500">💬 {item.comment}</p>}
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
