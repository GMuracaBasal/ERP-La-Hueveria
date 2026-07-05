import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usersDB } from '../lib/db';
import { hashPassword } from '../lib/utils';
import { Egg } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Por favor complete todos los campos.');
      return;
    }

    const hashed = await hashPassword(password);
    const users = await usersDB.getAll();
    const user = users.find(u => u.username === username && u.passwordHash === hashed);

    if (user) {
      login(user);
      if (user.role === 'vendedor') {
        navigate('/pos');
      } else {
        navigate('/');
      }
    } else {
      setError('Usuario o contraseña incorrectos.');
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-brand-orange">
          <Egg className="w-16 h-16" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Iniciar Sesión
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Sistema de Gestión
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-10 px-4 shadow-sm rounded-2xl sm:px-10 border border-brand-border">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                Usuario
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 border border-brand-border rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-teja focus:border-brand-teja sm:text-sm bg-brand-cream/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                Contraseña
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 border border-brand-border rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-teja focus:border-brand-teja sm:text-sm bg-brand-cream/20"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm font-medium bg-red-50 p-3 rounded-lg border border-red-100">{error}</div>
            )}

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold tracking-wide uppercase text-white bg-brand-teja hover:bg-[#b5622e] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-teja transition-all"
              >
                Ingresar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
