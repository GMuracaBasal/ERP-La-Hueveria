import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { cn } from '../lib/utils';
import { Edit2, Trash2, X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import Select, { Props as SelectProps } from 'react-select';

// ─────────────────────────────────────────────────────────
// SEARCHABLE SELECT (sin cambios)
// ─────────────────────────────────────────────────────────
export function SearchableSelect<Option = unknown, IsMulti extends boolean = false, Group extends import('react-select').GroupBase<Option> = import('react-select').GroupBase<Option>>(props: SelectProps<Option, IsMulti, Group>) {
  return (
    <Select
      {...props}
      menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
      styles={{
        menuPortal: base => ({ ...base, zIndex: 9999 }),
        control: (base, state) => ({
          ...base,
          borderColor: state.isFocused ? '#C8703F' : '#E2E8F0',
          boxShadow: state.isFocused ? '0 0 0 1px #C8703F' : 'none',
          '&:hover': { borderColor: state.isFocused ? '#C8703F' : '#cbd5e1' },
          borderRadius: '0.375rem',
          padding: '2px',
        }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isSelected ? '#C8703F' : state.isFocused ? '#F5EDE5' : 'white',
          color: state.isSelected ? 'white' : '#333333',
          '&:active': { backgroundColor: '#b5622e' },
        }),
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────
// BUTTON
// ─────────────────────────────────────────────────────────
export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost',
  size?: 'sm' | 'md' | 'lg'
}>(({ className, variant = 'primary', size = 'md', ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-teja focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
        {
          'bg-brand-teja text-white hover:bg-[#b5622e]': variant === 'primary',
          'bg-white text-gray-700 border border-brand-border hover:bg-gray-50': variant === 'secondary',
          'bg-brand-danger text-white hover:bg-red-700': variant === 'danger',
          'bg-transparent text-gray-600 hover:bg-brand-durazno hover:text-brand-navy': variant === 'ghost',
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
        },
        className
      )}
      {...props}
    />
  );
});
Button.displayName = 'Button';

// ─────────────────────────────────────────────────────────
// ACTION BUTTONS (sin cambios)
// ─────────────────────────────────────────────────────────
export function ActionButtons({ onEdit, onDelete }: { onEdit?: () => void, onDelete?: () => void }) {
  return (
    <div className="flex gap-2">
      {onEdit && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Editar">
          <Edit2 className="w-4 h-4" />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }} className="text-gray-400 hover:text-brand-danger transition-colors p-1" title="Eliminar">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────────────────────
export function Badge({ children, className, variant = 'default' }: { children: React.ReactNode, className?: string, variant?: 'default' | 'success' | 'danger' | 'warning' }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider",
      {
        'bg-gray-100 text-gray-600': variant === 'default',
        'bg-green-50 text-green-700': variant === 'success',
        'bg-red-50 text-red-700': variant === 'danger',
        'bg-brand-durazno text-brand-navy': variant === 'warning',
      },
      className
    )}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────
export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  // Cierre con ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Bloquear scroll del fondo
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
        </div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="relative z-10 inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full border border-brand-border">
          <div className="bg-white px-6 pt-6 pb-6">
            <div className="flex items-center justify-between border-b border-brand-border pb-4 mb-4">
              <h3 id="modal-title" className="text-xl font-bold text-brand-navy">{title}</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// CONFIRM DIALOG
// Reemplaza todos los confirm() nativos del browser.
// Uso: const { confirm } = useConfirm();
//      await confirm({ title: 'Eliminar cliente', description: 'Esta acción no se puede deshacer.', confirmLabel: 'Sí, eliminar' })
// ─────────────────────────────────────────────────────────
type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmContextType = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const handleResponse = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  // Foco inicial al botón Cancelar (fricción intencional — el destructivo no es el foco)
  useEffect(() => {
    if (state) {
      // El foco va al overlay del dialog, Tab lleva al Cancelar primero
    }
  }, [state]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-brand-border max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 id="confirm-title" className="text-lg font-bold text-brand-navy mb-2">{state.title}</h3>
            {state.description && (
              <p className="text-sm text-brand-muted mb-6">{state.description}</p>
            )}
            <div className="flex justify-end gap-3">
              {/* Cancelar va primero — el destructivo no es el foco inicial */}
              <Button variant="secondary" autoFocus onClick={() => handleResponse(false)}>
                {state.cancelLabel || 'Cancelar'}
              </Button>
              <Button ref={confirmBtnRef} variant="danger" onClick={() => handleResponse(true)}>
                {state.confirmLabel || 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return ctx;
}

// ─────────────────────────────────────────────────────────
// TOAST SYSTEM
// Uso: const { toast } = useToast();
//      toast.success('Cliente guardado correctamente');
//      toast.error('No se pudo guardar. Intentá de nuevo.');
// ─────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info';

type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
};

type ToastContextType = {
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    warning: (msg: string) => void;
    info: (msg: string) => void;
  };
};

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => {
      const next = [...prev, { id, type, message }];
      // Máximo 3 toasts simultáneos
      return next.slice(-3);
    });

    // Auto-dismiss: éxito/info 3s, advertencia 4s, error NO (manual)
    if (type !== 'error') {
      const duration = type === 'warning' ? 4000 : 3000;
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const toast = {
    success: (msg: string) => addToast('success', msg),
    error:   (msg: string) => addToast('error', msg),
    warning: (msg: string) => addToast('warning', msg),
    info:    (msg: string) => addToast('info', msg),
  };

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle className="w-5 h-5 text-brand-success flex-shrink-0" />,
    error:   <XCircle     className="w-5 h-5 text-brand-danger  flex-shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-brand-warning flex-shrink-0" />,
    info:    <Info        className="w-5 h-5 text-brand-navy   flex-shrink-0" />,
  };

  const borders: Record<ToastType, string> = {
    success: 'border-l-4 border-brand-success',
    error:   'border-l-4 border-brand-danger',
    warning: 'border-l-4 border-brand-warning',
    info:    'border-l-4 border-brand-navy',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Contenedor de toasts — esquina superior derecha */}
      <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 w-80">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-3 bg-white rounded-xl shadow-lg p-4",
              borders[t.type]
            )}
          >
            {icons[t.type]}
            <p className="flex-1 text-sm text-brand-text">{t.message}</p>
            <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
