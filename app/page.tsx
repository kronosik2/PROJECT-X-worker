'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function WorkerPage() {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [worker, setWorker] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  // Состояния для регистрации
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerAge, setRegisterAge] = useState('');
  const [registerSelfEmployed, setRegisterSelfEmployed] = useState(false);
  const [registerBio, setRegisterBio] = useState('');

  // Валидация телефона
  const validatePhone = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '');
    const isValid = cleaned.length === 11 && (cleaned[0] === '7' || cleaned[0] === '8');
    
    if (!isValid && phone.length > 0) {
      setPhoneError('❌ Неверный формат. Используйте +79091234567 или 89091234567');
    } else {
      setPhoneError('');
    }
    return isValid;
  };

  const formatPhoneForDb = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned[0] === '8') {
      return '+7' + cleaned.slice(1);
    }
    if (cleaned.length === 11 && cleaned[0] === '7') {
      return '+7' + cleaned.slice(1);
    }
    return phone;
  };

  // Кнопка «Войти»
  const handleLogin = async () => {
    if (!validatePhone(phone)) {
      return;
    }
    
    setLoginLoading(true);
    const formattedPhone = formatPhoneForDb(phone);
    
    try {
      const { data: existing, error } = await supabase
        .from('workers')
        .select('*')
        .eq('phone', formattedPhone)
        .maybeSingle();
      
      if (error) {
        console.error('Ошибка запроса:', error);
        alert('❌ Ошибка соединения. Проверьте интернет и попробуйте снова.');
        return;
      }
      
      if (existing) {
        setWorker(existing);
        await loadBalance(existing.id);
        setShowRegisterForm(false);
      } else {
        setShowRegisterForm(true);
      }
    } catch (err) {
      console.error('Исключение:', err);
      alert('❌ Не удалось подключиться к серверу. Попробуйте позже.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Кнопка «Создать аккаунт»
  const handleRegister = async () => {
    if (!validatePhone(phone)) {
      return;
    }
    
    if (!registerName.trim()) {
      alert('❌ Введите имя');
      return;
    }
    
    if (!registerAge || parseInt(registerAge) < 18) {
      alert('❌ Возраст должен быть 18+');
      return;
    }
    
    setRegisterLoading(true);
    const formattedPhone = formatPhoneForDb(phone);
    
    try {
      const { data: newWorker, error } = await supabase
        .from('workers')
        .insert([{
          phone: formattedPhone,
          name: registerName,
          age: parseInt(registerAge),
          is_self_employed: registerSelfEmployed,
          bio: registerBio || null,
          rating: 5,
          total_jobs: 0,
          is_active: true
        }])
        .select()
        .single();
      
      if (error) {
        if (error.code === '23505') {
          alert('❌ Этот номер телефона уже зарегистрирован. Войдите.');
          setShowRegisterForm(false);
        } else {
          alert('❌ Ошибка регистрации: ' + error.message);
        }
        return;
      }
      
      await supabase
        .from('wallets')
        .insert([{ worker_id: newWorker.id, balance: 100, reserved: 0 }]);
      
      setWorker(newWorker);
      setBalance(100);
      setShowRegisterForm(false);
      
      // Очищаем форму
      setRegisterName('');
      setRegisterAge('');
      setRegisterSelfEmployed(false);
      setRegisterBio('');
    } catch (err) {
      console.error('Ошибка регистрации:', err);
      alert('❌ Не удалось подключиться к серверу. Попробуйте позже.');
    } finally {
      setRegisterLoading(false);
    }
  };

  const loadBalance = async (workerId: string) => {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance, reserved')
      .eq('worker_id', workerId)
      .maybeSingle();
    
    if (wallet) {
      setBalance(wallet.balance - (wallet.reserved || 0));
    }
  };

  const loadOrders = async () => {
    if (!worker) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'open')
        .limit(20)
        .order('created_at', { ascending: false });
      
      if (!error && data) setOrders(data);
    } catch (err) {
      console.error('Ошибка загрузки заказов:', err);
    } finally {
      setLoading(false);
    }
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
      await loadBalance(worker.id);
    }
  };

  useEffect(() => {
    if (worker) {
      loadOrders();
      const interval = setInterval(loadOrders, 30000);
      return () => clearInterval(interval);
    }
  }, [worker]);

  // Экран входа / регистрации
  if (!worker) {
    return (
      <div style={{ maxWidth: '450px', margin: '60px auto', padding: '20px' }}>
        <div style={{ background: 'white', borderRadius: '32px', padding: '32px', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>👷 ПРОЕКТ X</h1>
          <p style={{ color: '#64748b', marginBottom: '24px' }}>Вход для исполнителей</p>
          
          <label style={{ fontWeight: 500, marginBottom: 8, display: 'block' }}>📱 Телефон</label>
          <input
            type="tel"
            placeholder="+7 (999) 123-45-67"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              validatePhone(e.target.value);
            }}
            style={{ 
              width: '100%', 
              padding: '14px', 
              borderRadius: '40px', 
              border: phoneError ? '2px solid #ef4444' : '1px solid #e2e8f0',
              marginBottom: '8px', 
              fontSize: '16px' 
            }}
          />
          {phoneError && (
            <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>
              {phoneError}
            </p>
          )}
          <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '16px' }}>
            📌 Пример: +79091234567 или 89091234567
          </p>
          
          <button
            onClick={handleLogin}
            disabled={loginLoading}
            style={{ 
              width: '100%', 
              padding: '14px', 
              background: '#0f172a', 
              color: 'white', 
              border: 'none', 
              borderRadius: '40px', 
              fontSize: '16px', 
              cursor: loginLoading ? 'not-allowed' : 'pointer',
              opacity: loginLoading ? 0.6 : 1,
              marginBottom: '12px'
            }}
          >
            {loginLoading ? '⏳ Проверка...' : '🔑 Войти'}
          </button>
          
          {showRegisterForm && (
            <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
              <h3 style={{ marginBottom: '16px' }}>📝 Создать аккаунт</h3>
              
              <label style={{ fontWeight: 500, marginBottom: 8, display: 'block' }}>Имя *</label>
              <input
                type="text"
                placeholder="Иван"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '40px', border: '1px solid #e2e8f0', marginBottom: '12px' }}
              />
              
              <label style={{ fontWeight: 500, marginBottom: 8, display: 'block' }}>Возраст *</label>
              <input
                type="number"
                placeholder="25"
                value={registerAge}
                onChange={(e) => setRegisterAge(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '40px', border: '1px solid #e2e8f0', marginBottom: '12px' }}
              />
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  checked={registerSelfEmployed}
                  onChange={(e) => setRegisterSelfEmployed(e.target.checked)}
                />
                Я самозанятый
              </label>
              
              <label style={{ fontWeight: 500, marginBottom: 8, display: 'block' }}>О себе</label>
              <textarea
                placeholder="Опыт, транспорт, инвентарь..."
                value={registerBio}
                onChange={(e) => setRegisterBio(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '12px', borderRadius: '24px', border: '1px solid #e2e8f0', marginBottom: '16px' }}
              />
              
              <button
                onClick={handleRegister}
                disabled={registerLoading}
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  background: '#22c55e', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '40px', 
                  cursor: registerLoading ? 'not-allowed' : 'pointer',
                  opacity: registerLoading ? 0.6 : 1
                }}
              >
                {registerLoading ? '⏳ Регистрация...' : '✅ Создать аккаунт'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Основная страница с лентой
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '24px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '20px', margin: 0 }}>👋 {worker.name}, {worker.age} лет</h2>
            <p style={{ color: '#64748b', margin: '4px 0 0' }}>
              ⭐ {worker.rating} / 5 · Выполнено: {worker.total_jobs || 0}
              {worker.is_self_employed && <span style={{ marginLeft: '8px' }}>✅ Самозанятый</span>}
            </p>
            {worker.bio && <p style={{ fontSize: '13px', color: '#475569', marginTop: '8px' }}>📝 {worker.bio}</p>}
            <p style={{ color: '#22c55e', margin: '8px 0 0', fontWeight: 'bold' }}>💰 Доступно: {balance} ₽</p>
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
        <button onClick={loadOrders} style={{ padding: '8px 20px', background: '#e2e8f0', border: 'none', borderRadius: '40px', cursor: 'pointer' }}>
          🔄 Обновить
        </button>
      </div>

      {loading && <p>⏳ Загрузка заказов...</p>}
      
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
