'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function WorkerPage() {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [worker, setWorker] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'my'>('feed');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);
  
  const [balance, setBalance] = useState(0);
  const [activeResponsesCount, setActiveResponsesCount] = useState(0);
  const [responding, setResponding] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerAge, setRegisterAge] = useState('');
  const [registerSelfEmployed, setRegisterSelfEmployed] = useState(false);
  const [registerBio, setRegisterBio] = useState('');

  const MAX_ACTIVE_RESPONSES = 3;

  const validatePhone = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '');
    const isValid = cleaned.length === 11 && (cleaned[0] === '7' || cleaned[0] === '8');
    if (!isValid && phone.length > 0) {
      setPhoneError('❌ Неверный формат');
    } else {
      setPhoneError('');
    }
    return isValid;
  };

  const formatPhoneForDb = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned[0] === '8') return '+7' + cleaned.slice(1);
    if (cleaned.length === 11 && cleaned[0] === '7') return '+7' + cleaned.slice(1);
    return phone;
  };

  const loadBalance = async (workerId: string) => {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance, reserved')
      .eq('worker_id', workerId)
      .maybeSingle();
    if (wallet) setBalance(wallet.balance - (wallet.reserved || 0));
  };

  const loadActiveResponsesCount = async (workerId: string) => {
    const { data: workerData } = await supabase
      .from('workers')
      .select('active_responses_count')
      .eq('id', workerId)
      .single();
    if (workerData) setActiveResponsesCount(workerData.active_responses_count || 0);
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

  const loadMyOrders = async () => {
    if (!worker) return;
    setLoadingMy(true);
    const { data, error } = await supabase
      .from('responses')
      .select(`
        id,
        worker_status,
        price_offer,
        comment,
        created_at,
        orders (
          id,
          address,
          work_description,
          tariff,
          hourly_rate,
          fixed_budget,
          time_slot,
          status as order_status,
          client_phone
        )
      `)
      .eq('worker_id', worker.id)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      const formatted = data.map((r: any) => ({
        id: r.id,
        worker_status: r.worker_status,
        price_offer: r.price_offer,
        comment: r.comment,
        created_at: r.created_at,
        order: r.orders
      }));
      setMyOrders(formatted);
    }
    setLoadingMy(false);
  };

  const respondToOrder = async (orderId: string) => {
    if (!worker) return;
    if (activeResponsesCount >= MAX_ACTIVE_RESPONSES) {
      alert(`❌ Вы уже откликнулись на ${MAX_ACTIVE_RESPONSES} заказов`);
      return;
    }
    if (balance < 10) {
      alert('❌ Недостаточно средств (нужно 10₽ для резерва)');
      return;
    }
    
    const priceOffer = prompt('Ваша цена (₽):');
    if (!priceOffer || isNaN(parseInt(priceOffer))) return;
    const comment = prompt('Комментарий для клиента (необязательно):');
    setResponding(orderId);
    
    const { error } = await supabase.from('responses').insert([{
      order_id: orderId,
      worker_id: worker.id,
      worker_name: worker.name,
      worker_phone: worker.phone,
      worker_rating: worker.rating,
      price_offer: parseInt(priceOffer),
      comment: comment || '',
      worker_status: 'pending',
      status: 'pending'
    }]);
    
    setResponding(null);
    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      alert('✅ Отклик отправлен! 10₽ зарезервировано');
      await loadBalance(worker.id);
      await loadActiveResponsesCount(worker.id);
      await loadOrders();      // обновляем ленту (заказ пропадёт)
      await loadMyOrders();    // обновляем мои заказы (заказ появится)
    }
  };

  const confirmOrder = async (responseId: string, orderId: string) => {
    await supabase.from('responses').update({ worker_status: 'confirmed' }).eq('id', responseId);
    await supabase.from('orders').update({ status: 'in_progress' }).eq('id', orderId);
    alert('✅ Заказ подтверждён! Приступайте к работе');
    await loadMyOrders();
    await loadOrders();
  };

  const completeOrder = async (responseId: string, orderId: string) => {
    if (!confirm('Завершить заказ? Клиент получит уведомление')) return;
    await supabase.from('responses').update({ worker_status: 'completed' }).eq('id', responseId);
    await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
    alert('✅ Заказ завершён! Спасибо за работу');
    await loadActiveResponsesCount(worker.id);
    await loadMyOrders();
    await loadOrders();
  };

  const cancelOrder = async (responseId: string, orderId: string) => {
    if (!confirm('Отменить заказ? Деньги вернутся на баланс')) return;
    await supabase.from('responses').update({ worker_status: 'cancelled' }).eq('id', responseId);
    await supabase.from('orders').update({ status: 'open' }).eq('id', orderId);
    alert('❌ Заказ отменён, деньги возвращены');
    await loadActiveResponsesCount(worker.id);
    await loadBalance(worker.id);
    await loadMyOrders();
    await loadOrders();
  };

  const handleLogin = async () => {
    if (!validatePhone(phone)) return;
    setLoginLoading(true);
    const formattedPhone = formatPhoneForDb(phone);
    const { data: existing, error } = await supabase
      .from('workers')
      .select('*')
      .eq('phone', formattedPhone)
      .maybeSingle();
    
    if (error) alert('Ошибка: ' + error.message);
    else if (existing) {
      setWorker(existing);
      await loadBalance(existing.id);
      await loadActiveResponsesCount(existing.id);
      setShowRegisterForm(false);
    } else setShowRegisterForm(true);
    setLoginLoading(false);
  };

  const handleRegister = async () => {
    if (!validatePhone(phone)) return;
    if (!registerName.trim()) { alert('Введите имя'); return; }
    if (!registerAge || parseInt(registerAge) < 18) { alert('Возраст должен быть 18+'); return; }
    
    setRegisterLoading(true);
    const formattedPhone = formatPhoneForDb(phone);
    const { data: newWorker, error } = await supabase
      .from('workers')
      .insert([{ phone: formattedPhone, name: registerName, age: parseInt(registerAge), is_self_employed: registerSelfEmployed, bio: registerBio || null, rating: 5, total_jobs: 0, is_active: true }])
      .select()
      .single();
    
    if (error) alert('Ошибка: ' + error.message);
    else {
      await supabase.from('wallets').insert([{ worker_id: newWorker.id, balance: 100, reserved: 0 }]);
      setWorker(newWorker);
      setBalance(100);
      setShowRegisterForm(false);
      setRegisterName('');
      setRegisterAge('');
      setRegisterSelfEmployed(false);
      setRegisterBio('');
    }
    setRegisterLoading(false);
  };

  useEffect(() => {
    if (worker) {
      loadOrders();
      loadMyOrders();
      loadBalance(worker.id);
      loadActiveResponsesCount(worker.id);
    }
  }, [worker]);

  if (!worker) {
    return (
      <div style={{ maxWidth: '450px', margin: '60px auto', padding: '20px' }}>
        <div style={{ background: 'white', borderRadius: '32px', padding: '32px', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>👷 ПРОЕКТ X</h1>
          <p style={{ color: '#64748b', marginBottom: '24px' }}>Вход для исполнителей</p>
          
          <input
            type="tel"
            placeholder="+7 (999) 123-45-67"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); validatePhone(e.target.value); }}
            style={{ width: '100%', padding: '14px', borderRadius: '40px', border: phoneError ? '2px solid #ef4444' : '1px solid #e2e8f0', marginBottom: '8px', fontSize: '16px' }}
          />
          {phoneError && <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>{phoneError}</p>}
          <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '16px' }}>📌 Пример: +79091234567 или 89091234567</p>
          
          <button onClick={handleLogin} disabled={loginLoading} style={{ width: '100%', padding: '14px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '40px', fontSize: '16px', cursor: loginLoading ? 'not-allowed' : 'pointer', opacity: loginLoading ? 0.6 : 1, marginBottom: '12px' }}>
            {loginLoading ? '⏳ Проверка...' : '🔑 Войти'}
          </button>
          
          {showRegisterForm && (
            <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
              <h3 style={{ marginBottom: '16px' }}>📝 Создать аккаунт</h3>
              <input type="text" placeholder="Имя *" value={registerName} onChange={(e) => setRegisterName(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '40px', border: '1px solid #e2e8f0', marginBottom: '12px' }} />
              <input type="number" placeholder="Возраст *" value={registerAge} onChange={(e) => setRegisterAge(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '40px', border: '1px solid #e2e8f0', marginBottom: '12px' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><input type="checkbox" checked={registerSelfEmployed} onChange={(e) => setRegisterSelfEmployed(e.target.checked)} /> Я самозанятый</label>
              <textarea placeholder="О себе (опыт, транспорт, инвентарь...)" value={registerBio} onChange={(e) => setRegisterBio(e.target.value)} rows={3} style={{ width: '100%', padding: '12px', borderRadius: '24px', border: '1px solid #e2e8f0', marginBottom: '16px' }} />
              <button onClick={handleRegister} disabled={registerLoading} style={{ width: '100%', padding: '12px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '40px', cursor: registerLoading ? 'not-allowed' : 'pointer', opacity: registerLoading ? 0.6 : 1 }}>{registerLoading ? '⏳ Регистрация...' : '✅ Создать аккаунт'}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '20px', margin: 0 }}>👋 {worker.name}, {worker.age} лет</h2>
            <p style={{ color: '#64748b', margin: '4px 0 0' }}>⭐ {worker.rating} / 5 · Выполнено: {worker.total_jobs || 0}</p>
            <p style={{ color: '#22c55e', margin: '8px 0 0', fontWeight: 'bold' }}>💰 Доступно: {balance} ₽</p>
            <p style={{ fontSize: '13px', color: activeResponsesCount >= MAX_ACTIVE_RESPONSES ? '#ef4444' : '#22c55e', marginTop: '4px' }}>📋 Активных откликов: {activeResponsesCount}/{MAX_ACTIVE_RESPONSES}</p>
          </div>
          <button onClick={() => setWorker(null)} style={{ padding: '8px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>Выход</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button onClick={() => setActiveTab('feed')} style={{ flex: 1, padding: '12px', borderRadius: '40px', border: 'none', background: activeTab === 'feed' ? '#0f172a' : '#e2e8f0', color: activeTab === 'feed' ? 'white' : '#0f172a', cursor: 'pointer' }}>🚛 Лента заказов</button>
        <button onClick={() => { setActiveTab('my'); loadMyOrders(); }} style={{ flex: 1, padding: '12px', borderRadius: '40px', border: 'none', background: activeTab === 'my' ? '#0f172a' : '#e2e8f0', color: activeTab === 'my' ? 'white' : '#0f172a', cursor: 'pointer' }}>📋 Мои заказы</button>
      </div>

      {activeTab === 'feed' && (
        <>
          <button onClick={loadOrders} style={{ marginBottom: '20px', padding: '8px 20px', background: '#e2e8f0', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>🔄 Обновить</button>
          {loading && <p>⏳ Загрузка...</p>}
          {!loading && orders.length === 0 && <p style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>🤷 Нет открытых заказов</p>}
          {orders.map(order => (
            <div key={order.id} style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
              <h3 style={{ marginBottom: '8px' }}>📍 {order.address}</h3>
              <p style={{ color: '#475569', marginBottom: '12px' }}>{order.work_description}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                <span style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '40px', fontSize: '14px' }}>{order.tariff === 'hourly' ? `💰 ${order.hourly_rate} ₽/час` : `💰 Фиксированный: ${order.fixed_budget} ₽`}</span>
                <span style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '40px', fontSize: '14px' }}>📅 {new Date(order.time_slot).toLocaleString()}</span>
              </div>
              <button onClick={() => respondToOrder(order.id)} disabled={responding === order.id || activeResponsesCount >= MAX_ACTIVE_RESPONSES || balance < 10} style={{ padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '40px', cursor: (responding === order.id || activeResponsesCount >= MAX_ACTIVE_RESPONSES || balance < 10) ? 'not-allowed' : 'pointer', opacity: (responding === order.id || activeResponsesCount >= MAX_ACTIVE_RESPONSES || balance < 10) ? 0.5 : 1 }}>
                {responding === order.id ? 'Отправка...' : balance < 10 ? '💰 Недостаточно средств (10₽)' : '💬 Откликнуться (10₽)'}
              </button>
            </div>
          ))}
        </>
      )}

      {activeTab === 'my' && (
        <>
          <button onClick={loadMyOrders} style={{ marginBottom: '20px', padding: '8px 20px', background: '#e2e8f0', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>🔄 Обновить</button>
          {loadingMy && <p>⏳ Загрузка...</p>}
          {!loadingMy && myOrders.length === 0 && <p style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>🤷 У вас пока нет откликов</p>}
          {myOrders.map((item: any) => {
            const order = item.order;
            const status = item.worker_status;
            let statusText = '', statusColor = '', buttons = null;
            if (status === 'pending') { statusText = '⏳ Ожидает ответа клиента'; statusColor = '#f59e0b'; buttons = <button onClick={() => cancelOrder(item.id, order.id)} style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>❌ Отменить отклик</button>; }
            else if (status === 'approved') { statusText = '✅ Клиент выбрал вас! Подтвердите'; statusColor = '#22c55e'; buttons = <button onClick={() => confirmOrder(item.id, order.id)} style={{ padding: '8px 16px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>✅ Подтвердить заказ</button>; }
            else if (status === 'confirmed') { statusText = '🚚 В работе'; statusColor = '#3b82f6'; buttons = <button onClick={() => completeOrder(item.id, order.id)} style={{ padding: '8px 16px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>🏁 Завершить заказ</button>; }
            else if (status === 'completed') { statusText = '✅ Выполнен ✓'; statusColor = '#10b981'; buttons = null; }
            else if (status === 'cancelled') { statusText = '❌ Отменён'; statusColor = '#ef4444'; buttons = null; }
            return (
              <div key={item.id} style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ background: statusColor, padding: '4px 12px', borderRadius: '40px', fontSize: '12px', color: 'white' }}>{statusText}</span>
                  <span style={{ fontWeight: 'bold', color: '#22c55e' }}>💰 {item.price_offer} ₽</span>
                </div>
                <h3 style={{ marginBottom: '8px' }}>📍 {order.address}</h3>
                <p style={{ color: '#475569', marginBottom: '12px' }}>{order.work_description}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                  <span style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '40px', fontSize: '14px' }}>📅 {new Date(order.time_slot).toLocaleString()}</span>
                </div>
                {item.comment && <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>💬 Ваш комментарий: {item.comment}</p>}
                {buttons}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
