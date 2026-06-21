import React from 'react';
import { cn } from '../lib/utils';
import { Edit2, Trash2 } from 'lucide-react';
import Select, { Props as SelectProps } from 'react-select';

export function SearchableSelect<Option = unknown, IsMulti extends boolean = false, Group extends import('react-select').GroupBase<Option> = import('react-select').GroupBase<Option>>(props: SelectProps<Option, IsMulti, Group>) {
  return (
    <Select
      {...props}
      menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
      styles={{
        menuPortal: base => ({ ...base, zIndex: 9999 }),
        control: (base, state) => ({
          ...base,
          borderColor: state.isFocused ? '#f59e0b' : '#e5e7eb', // border-gray-200 and brand-orange roughly
          boxShadow: state.isFocused ? '0 0 0 1px #f59e0b' : 'none',
          '&:hover': {
            borderColor: state.isFocused ? '#f59e0b' : '#d1d5db',
          },
          borderRadius: '0.375rem', 
          padding: '2px', // match usual padding
        }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isSelected 
            ? '#f59e0b' 
            : state.isFocused 
              ? '#fef3c7' // amber-50
              : 'white',
          color: state.isSelected ? 'white' : '#374151',
          '&:active': {
            backgroundColor: '#fbbf24',
          }
        }),
      }}
    />
  );
}

export function Button({ 
  className, variant = 'primary', size = 'md', ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost',
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
        {
          'bg-brand-orange text-white hover:bg-amber-600': variant === 'primary',
          'bg-white text-gray-700 border border-brand-border hover:bg-gray-50': variant === 'secondary',
          'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
          'bg-transparent text-gray-600 hover:bg-brand-cream hover:text-brand-brown': variant === 'ghost',
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
        },
        className
      )}
      {...props}
    />
  );
}

export function ActionButtons({ onEdit, onDelete }: { onEdit?: () => void, onDelete?: () => void }) {
  return (
    <div className="flex gap-2">
      {onEdit && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Editar">
          <Edit2 className="w-4 h-4" />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }} className="text-gray-400 hover:text-red-600 transition-colors p-1" title="Eliminar">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function Badge({ children, className, variant = 'default' }: { children: React.ReactNode, className?: string, variant?: 'default'|'success'|'danger'|'warning' }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider",
      {
        'bg-gray-100 text-gray-600': variant === 'default',
        'bg-green-50 text-green-700': variant === 'success',
        'bg-red-50 text-red-700': variant === 'danger',
        'bg-brand-cream text-brand-brown': variant === 'warning',
      },
      className
    )}>
      {children}
    </span>
  );
}

export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose}></div>
        </div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="relative z-10 inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl shadow-brand-brown/10 transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full border border-brand-border">
          <div className="bg-white px-6 pt-6 pb-6">
            <h3 className="text-xl font-bold text-brand-brown border-b border-brand-border pb-4 mb-4">{title}</h3>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
