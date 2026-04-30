'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function WorkerPage() {
  const [phone, setPhone] = useState('');
  const [worker, setWorker] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);

  const login = async () => {
    if (!phone || phone.length < 6) {
      alert('Введите корректный телефон');
      return;
    }
    
    // Поиск существующего грузчика
    const { data: existing } = await supabase
      .from('workers')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    
    if (existing) {
      setWorker(existing);
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance, reserved')
        .eq('worker_id', existing.id)
        .single();
      if (wallet) setBalance(wallet.balance - wallet.reserved);
      return;
    }
    
    // Новый грузчик
    const name = prompt('Введите ваше имя:');
    if (!name) return;
    
    const { data: newWorker } = await supabase
      .from('workers')
      .insert([{ phone, name, rating: 5, total_jobs: 0, is_active: true }])
      .select()
      .single();
    
    if (newWorker) {
      setWorker(newWorker);
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance, reserved')
        .eq('worker_id', newWorker.id)
        .single();
      if (wallet) setBalance(wallet.balance - wallet.reserved);
    }
  };

  const loadOrders = async () => {
    if (!worker) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'open')
      .limit(20)
      .order('created_at', { ascending: false });
    
    if (!error && data) setOrders(data);
    setLoading(false);
  };

  const respondToOrder = async (orderId: string) => {
    if (!worker) return;
    
    const priceOffer = prompt('Ваша цена (₽):');
    if (!priceOffer || isNaN(parseInt(priceOffer))) {
      alert('Введите корректную цену');
      return;
    }
    
    const comment = prompt('Комментарий для клиента (необязательно):');
    setResponding(orderId);
    
    const { data, error } = await supabase.rpc('respond_to_order', {
      p_order_id: orderId,
      p_worker_id: worker.id,
      p_price_offer: parseInt(priceOffer),
      p_comment: comment || ''
    });
    
    setResponding(null);
    
    if (error) {
      alert('Ошибка: ' + error.message);
    } else if (data && data.error) {
      alert(data.error);
    } else {
      alert('✅ Отклик отправлен! 10₽ зарезервировано');
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance, reserved')
        .eq('worker_id', worker.id)
        .single();
      if (wallet) setBalance(wallet.balance - wallet.reserved);
    }
  };

  useEffect(() => {
    if (worker) {
      loadOrders();
      const interval = setInterval(loadOrders, 30000);
      return () => clearInterval(interval);
    }
  }, [worker]);

  if (!worker) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px' }}>
        <div style={{ background: 'white', borderRadius: '32px', padding: '32px', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>👷 ПРОЕКТ X</h1>
          <p style={{ color: '#64748b', marginBottom: '24px' }}>Вход для исполнителей</p>
          
          <input
            type="tel"
            placeholder="+7 (999) 123-45-67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: '100%', padding: '14px', borderRadius: '40px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '16px' }}
          />
          
          <button
            onClick={login}
            style={{ width: '100%', padding: '14px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '40px', fontSize: '16px', cursor: 'pointer' }}
          >
            Войти / Зарегистрироваться
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '20px', margin: 0 }}>👋 Здравствуйте, {worker.name}</h2>
            <p style={{ color: '#64748b', margin: '4px 0 0' }}>⭐ {worker.rating} / 5 · Выполнено: {worker.total_jobs || 0}</p>
            <p style={{ color: '#22c55e', margin: '4px 0 0', fontWeight: 'bold' }}>💰 Доступно: {balance} ₽</p>
          </div>
          <button
            onClick={() => setWorker(null)}
            style={{ padding: '8px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}
          >
            Выход
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>🚛 Лента заказов</h1>
        <button
          onClick={loadOrders}
          style={{ padding: '8px 20px', background: '#e2e8f0', border: 'none', borderRadius: '40px', cursor: 'pointer' }}
        >
          🔄 Обновить
        </button>
      </div>

      {loading && <p>⏳ Загрузка заказов... (до 10 секунд)</p>}
      
      {!loading && orders.length === 0 && (
        <div style={{ background: '#f8fafc', borderRadius: '24px', padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '18px', color: '#64748b' }}>🤷 Нет открытых заказов</p>
        </div>
      )}

      {orders.map(order => (
        <div key={order.id} style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Заказ #{order.id.slice(0, 8)}</span>
            <span style={{ background: '#22c55e', padding: '4px 12px', borderRadius: '40px', fontSize: '12px', color: 'white' }}>Открыт</span>
          </div>
          
          <h3 style={{ marginBottom: '8px' }}>
            📍 
            <a 
              href={`https://maps.yandex.ru/?text=${encodeURIComponent(order.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline', marginLeft: '8px' }}
            >
              {order.address}
            </a>
          </h3>
          
          <p style={{ color: '#475569', marginBottom: '12px' }}>{order.work_description}</p>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
            <span style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '40px', fontSize: '14px' }}>
              {order.tariff === 'hourly' ? `💰 ${order.hourly_rate} ₽/час` : `💰 Фиксированный: ${order.fixed_budget} ₽`}
            </span>
            <span style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '40px', fontSize: '14px' }}>
              📅 {new Date(order.time_slot).toLocaleString()}
            </span>
          </div>
          
          <button
            onClick={() => respondToOrder(order.id)}
            disabled={responding === order.id}
            style={{ 
              padding: '12px 24px', 
              background: balance < 10 ? '#94a3b8' : '#0f172a',
              color: 'white', 
              border: 'none', 
              borderRadius: '40px', 
              cursor: (responding === order.id || balance < 10) ? 'not-allowed' : 'pointer',
              opacity: (responding === order.id || balance < 10) ? 0.5 : 1,
              width: '100%'
            }}
          >
            {responding === order.id ? 'Отправка...' : balance < 10 ? '💰 Недостаточно средств' : '💬 Откликнуться (10₽)'}
          </button>
        </div>
      ))}
    </div>
  );
}
