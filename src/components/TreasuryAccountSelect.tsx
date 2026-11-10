import React, { useEffect, useState } from 'react';
import { SearchableSelect } from './ui';
import { treasuryAccountsDB } from '../lib/db';
import type { TreasuryAccount } from '../types';
import {
  arsEnabledAccounts,
  defaultArsAccountId,
  treasuryAccountOptionLabel,
} from '../lib/treasury';

export function useArsTreasuryAccounts() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await treasuryAccountsDB.getAll();
        if (!cancelled) setAccounts(arsEnabledAccounts(all));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    accounts,
    defaultId: defaultArsAccountId(accounts),
    loaded,
  };
}

interface TreasuryAccountSelectProps {
  accounts: TreasuryAccount[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  error?: string;
}

export default function TreasuryAccountSelect({
  accounts,
  value,
  onChange,
  label,
  error,
}: TreasuryAccountSelectProps) {
  const options = accounts.map((a) => ({
    value: a.id,
    label: treasuryAccountOptionLabel(a),
  }));

  return (
    <div>
      <label className="block text-sm mb-1">
        {label} <span className="text-brand-danger">*</span>
      </label>
      <SearchableSelect
        options={options}
        value={options.find((o) => o.value === value) ?? null}
        onChange={(selected: { value: string } | null) => onChange(selected?.value || '')}
        placeholder="Seleccionar cuenta..."
      />
      {error && <p className="text-xs text-brand-danger mt-1">{error}</p>}
    </div>
  );
}
