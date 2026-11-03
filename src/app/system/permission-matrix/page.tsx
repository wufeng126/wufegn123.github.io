'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Grid3x3, Loader2, X } from 'lucide-react';

type Role = {
  id: number;
  name: string;
  description?: string | null;
  code?: string | null;
  level?: number;
  permission_codes?: string[];
  is_super_admin?: boolean;
};

type MenuModule = { code: string; name: string; children: Array<{ code: string; name: string }> };

/**
 * 角色权限矩阵：行=模块，列=角色，一眼看清「谁能看什么」。
 * 只读展示；修改仍到「权限与账号 → 角色」里做。
 */
export default function PermissionMatrixPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<MenuModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string>('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesRes, menuRes] = await Promise.all([
        fetch('/api/system/permission/roles', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/system/permission/menu', { credentials: 'include', cache: 'no-store' }),
      ]);
      const rolesJson = await rolesRes.json();
      const menuJson = await menuRes.json();
      if (!rolesRes.ok || rolesJson.success === false) throw new Error(rolesJson.error || '角色加载失败');
      setRoles((rolesJson.roles || []) as Role[]);
      setModules(((menuJson.menu || []) as MenuModule[]));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleCell = useCallback(async (role: Role, module: MenuModule) => {
    if (role.is_super_admin) return;
    const moduleCodes = module.children.map((child) => child.code);
    const current = new Set(role.permission_codes || []);
    const allGranted = moduleCodes.every((code) => current.has(code));
    moduleCodes.forEach((code) => {
      if (allGranted) current.delete(code);
      else current.add(code);
    });
    const nextCodes = Array.from(current);
    const ok = window.confirm(
      `${allGranted ? '取消' : '授予'}「${role.name}」的「${module.name}」模块权限？\n（共 ${moduleCodes.length} 项权限点）`,
    );
    if (!ok) return;

    setSavingKey(`${role.id}-${module.code}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/system/permission/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: role.id,
          name: role.name,
          description: role.description || '',
          level: role.level || 10,
          permission_codes: nextCodes,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '保存失败');
      setNotice(`已更新「${role.name}」的「${module.name}」权限`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingKey('');
    }
  }, [load]);


  const matrix = useMemo(() => {
    return modules.map((module) => {
      const codes = module.children.map((child) => child.code);
      return {
        module,
        cells: roles.map((role) => {
          if (role.is_super_admin) return { granted: codes.length, total: codes.length, all: true };
          const grantedCodes = codes.filter((code) => (role.permission_codes || []).includes(code));
          return { granted: grantedCodes.length, total: codes.length, all: grantedCodes.length === codes.length };
        }),
      };
    });
  }, [modules, roles]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <Link href="/system-management?tab=permission" className="text-sm text-[var(--color-primary)] hover:underline">← 返回权限与账号</Link>
          <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
            <Grid3x3 className="h-5 w-5 text-[var(--color-primary)]" /> 角色权限矩阵
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-3)]">
            行=权限模块，列=角色。点击格子即可授予/取消该模块的全部权限点（超级管理员列不可改）。
          </p>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-[#B7EB8F] bg-[#F6FFED] px-4 py-3 text-sm text-[#237804]">{notice}</div> : null}

        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> 正在加载角色与权限…
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--color-muted)] px-3 py-2 text-left font-medium">权限模块</th>
                  {roles.map((role) => (
                    <th key={role.id} className="px-3 py-2 text-center font-medium whitespace-nowrap">
                      {role.name}
                      {role.is_super_admin ? <span className="ml-1 rounded bg-[#E8FFEA] px-1 text-[10px] text-[#00A870]">全权</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map(({ module, cells }) => (
                  <tr key={module.code} className="border-t border-[var(--border)]">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                      <div className="font-medium text-[var(--foreground)]">{module.name}</div>
                      <div className="text-xs text-[var(--color-text-3)]">{module.children.length} 项权限</div>
                    </td>
                    {cells.map((cell, index) => {
                      const role = roles[index];
                      const key = `${role.id}-${module.code}`;
                      const saving = savingKey === key;
                      return (
                        <td key={role.id} className="px-3 py-2 text-center">
                          <button
                            type="button"
                            disabled={role.is_super_admin || Boolean(savingKey)}
                            onClick={() => void toggleCell(role, module)}
                            title={role.is_super_admin ? '超级管理员拥有全部权限' : '点击授予/取消该模块权限'}
                            className={`mx-auto flex h-7 min-w-8 items-center justify-center rounded px-1.5 transition ${
                              role.is_super_admin
                                ? 'cursor-not-allowed opacity-60'
                                : 'hover:bg-[var(--color-muted)]'
                            }`}
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
                            ) : cell.granted === 0 ? (
                              <X className="h-4 w-4 text-[#D9D9D9]" />
                            ) : cell.all ? (
                              <CheckCircle2 className="h-4 w-4 text-[#00A870]" />
                            ) : (
                              <span className="rounded bg-[#FFF7E8] px-1.5 py-0.5 text-xs text-[#B35B00]">
                                {cell.granted}/{cell.total}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-[var(--color-text-3)]">
          说明：✓ = 全部授予；数字 = 部分授予（可点一次补全）；× = 未授予。点击格子立即保存，被改动的账号 60 秒内生效。
        </p>
      </div>
    </div>
  );
}
