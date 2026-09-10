import { describe, expect, it } from 'vitest';
import { checkApiWritePermission } from '../route-permissions';

describe('checkApiWritePermission supplier payment action permissions', () => {
  it('allows POST with create permission', () => {
    expect(checkApiWritePermission(
      '/api/supplier-contracts/payments',
      'POST',
      ['supplier_payments:create'],
      false
    )).toBe(true);
  });

  it('keeps POST compatible with edit permission', () => {
    expect(checkApiWritePermission(
      '/api/supplier-contracts/payments',
      'POST',
      ['supplier_payments:edit'],
      false
    )).toBe(true);
  });

  it('requires delete or edit permission for DELETE', () => {
    expect(checkApiWritePermission(
      '/api/supplier-contracts/payments/12',
      'DELETE',
      ['supplier_payments:create'],
      false
    )).toBe(false);

    expect(checkApiWritePermission(
      '/api/supplier-contracts/payments/12',
      'DELETE',
      ['supplier_payments:delete'],
      false
    )).toBe(true);
  });

  it('still requires edit permission for PUT', () => {
    expect(checkApiWritePermission(
      '/api/supplier-payments',
      'PUT',
      ['supplier_payments:create'],
      false
    )).toBe(false);

    expect(checkApiWritePermission(
      '/api/supplier-payments',
      'PUT',
      ['supplier_payments:edit'],
      false
    )).toBe(true);
  });
});
