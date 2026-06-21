import {
  User, Product, PriceList, Supplier, Customer,
  Purchase, Sale, InventoryMovement, FinanceMovement, Settings
} from '../types';

export const KEYS = {
  USERS: 'hueveria_users',
  PRODUCTS: 'hueveria_products',
  PRICE_LISTS: 'hueveria_price_lists',
  SUPPLIERS: 'hueveria_suppliers',
  CUSTOMERS: 'hueveria_customers',
  PURCHASES: 'hueveria_purchases',
  SALES: 'hueveria_sales',
  INVENTORY_MOVEMENTS: 'hueveria_inventory_movements',
  FINANCE_MOVEMENTS: 'hueveria_finance_movements',
  SETTINGS: 'hueveria_settings'
};

function get<T>(key: string, defaultValue: T): T {
  const stored = localStorage.getItem(key);
  if (!stored) return defaultValue;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return defaultValue;
  }
}

function set<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// DB Methods
export const db = {
  // Config
  getSettings: () => get<Settings>(KEYS.SETTINGS, { businessName: '', defaultPriceListId: null, setupCompleted: false }),
  setSettings: (settings: Settings) => set(KEYS.SETTINGS, settings),

  // Generic CRUD generator
  createCRUD<T extends { id: string }>(key: string) {
    return {
      getAll: (): T[] => get<T[]>(key, []),
      getById: (id: string): T | undefined => get<T[]>(key, []).find(item => item.id === id),
      save: (item: T) => {
        const items = get<T[]>(key, []);
        const index = items.findIndex(i => i.id === item.id);
        if (index >= 0) items[index] = item;
        else items.push(item);
        set(key, items);
      },
      delete: (id: string) => {
        const items = get<T[]>(key, []);
        set(key, items.filter(i => i.id !== id));
      }
    }
  },
};

export const usersDB = db.createCRUD<User>(KEYS.USERS);
export const productsDB = db.createCRUD<Product>(KEYS.PRODUCTS);
export const priceListsDB = db.createCRUD<PriceList>(KEYS.PRICE_LISTS);
export const suppliersDB = db.createCRUD<Supplier>(KEYS.SUPPLIERS);
export const customersDB = db.createCRUD<Customer>(KEYS.CUSTOMERS);
export const purchasesDB = db.createCRUD<Purchase>(KEYS.PURCHASES);
export const salesDB = db.createCRUD<Sale>(KEYS.SALES);
export const inventoryDB = db.createCRUD<InventoryMovement>(KEYS.INVENTORY_MOVEMENTS);
export const financeDB = db.createCRUD<FinanceMovement>(KEYS.FINANCE_MOVEMENTS);
