'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Order = {
  id: string;
  title: string;
  description: string;
  address: string;
  price: number;
  status: string;
  created_at: string;
};

export default function WorkerPage() {
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'my'>('feed');
  const [feedOrders, setFeedOrders] = useState<Order[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setWorkerId(session.user.id);
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (workerId) {
      if (activeTab === 'feed') fetchFeedOrders();
      else fetchMyOrders();
    }
  }, [workerId, activeTab]);

  async function fetchFeedOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .is('worker_id', null)
      .order('created_at', { ascending: true });
    
    setFeedOrders(data || []);
  }

  async function fetchMyOrders() {
    if (!workerId) return;
    
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('worker_id', workerId)
      .in('status', ['approved', 'confirmed', 'completed', 'cancelled'])
      .order('created_at', { ascending: false });
    
    setMyOrders(data || []);
  }

  async function takeOrder(orderId: string) {
    if (!workerId) return;
    
    const { data, error } = await supabase.rpc('take_order', {
      p_order_id: orderId,
      p_worker_id: workerId
    });
    
    if (error) {
      alert('Ошибка: ' + error.message);
    } else if (data?.success === false) {
      alert(data.error);
    } else {
      alert('Заказ взят! Списан резерв 10₽');
      await fetchFeedOrders();
      await fetchMyOrders();
    }
  }

  async function cancelOrder(orderId: string) {
    if (!workerId) return;
    
    const { data, error } = await supabase.rpc('cancel_order', {
      p_order_id: orderId,
      p_user_id: workerId,
      p_user_role: 'worker'
    });
    
    if (error) {
      alert('Ошибка: ' + error.message);
    } else if (data?.success === false) {
      alert(data.error);
    } else {
      alert('Заказ отменён, резерв возвращён');
      await fetchMyOrders();
      await fetchFeedOrders();
    }
  }

  if (loading) return <div className="p-4">Загрузка...</div>;
  if (!workerId) return null;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">PROJECT X - Исполнитель</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          Выйти
        </button>
      </div>

      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('feed')}
          className={`pb-2 px-4 ${activeTab === 'feed' ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : ''}`}
        >
          📋 Лента заказов ({feedOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('my')}
          className={`pb-2 px-4 ${activeTab === 'my' ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : ''}`}
        >
          👤 Мои заказы ({myOrders.length})
        </button>
      </div>

      {activeTab === 'feed' && (
        <div>
          <h2 className="text-xl font-bold mb-4">Доступные заказы</h2>
          {feedOrders.length === 0 && <p className="text-gray-500">Нет доступных заказов</p>}
          
          {feedOrders.map(order => (
            <div key={order.id} className="border rounded-lg p-4 mb-4 shadow">
              <h3 className="text-lg font-semibold">{order.title}</h3>
              <p className="text-gray-600">{order.description}</p>
              <p className="text-sm">📍 {order.address}</p>
              <p className="text-xl font-bold mt-2">{order.price} ₽</p>
              <button
                onClick={() => takeOrder(order.id)}
                className="mt-3 bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
              >
                Взять заказ (10₽ резерв)
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'my' && (
        <div>
          <h2 className="text-xl font-bold mb-4">Мои заказы</h2>
          {myOrders.length === 0 && <p className="text-gray-500">У вас нет активных заказов</p>}
          
          {myOrders.map(order => {
            const statusMap: Record<string, string> = {
              approved: '⏳ Ожидает подтверждения клиента',
              confirmed: '✅ Подтверждён, можно приступать',
              completed: '✔️ Завершён',
              cancelled: '❌ Отменён'
            };
            
            return (
              <div key={order.id} className="border rounded-lg p-4 mb-4 shadow">
                <h3 className="text-lg font-semibold">{order.title}</h3>
                <p className="text-gray-600">{order.description}</p>
                <p className="text-sm">📍 {order.address}</p>
                <p className="text-xl font-bold">{order.price} ₽</p>
                <p className="text-sm mt-2">{statusMap[order.status] || order.status}</p>
                
                {order.status === 'approved' && (
                  <button
                    onClick={() => cancelOrder(order.id)}
                    className="mt-3 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                  >
                    Отменить заказ
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
