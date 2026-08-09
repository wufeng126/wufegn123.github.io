import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { generateToken, UserPayload, UserRole } from './auth';
import { isSuperAdminUser } from './route-permissions';
import { getUserDisplayName } from './user-display-name';

// 密码哈希盐值 - 使用固定值确保所有环境一致
const PASSWORD_SALT = 'construction-labor-management-password-salt-2024-v1';

// 密码哈希
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function safeCompareHex(left: string, right: string): boolean {
  try {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function verifyScryptPassword(password: string, stored: string): boolean {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64).toString('hex');
  return safeCompareHex(candidate, hash);
}

// 验证密码
export function verifyPassword(password: string, hash: string): boolean {
  if (!hash) return false;

  if (hash.startsWith('scrypt$')) {
    return verifyScryptPassword(password, hash);
  }

  const legacySaltedHash = createHash('sha256').update(password + PASSWORD_SALT).digest('hex');
  if (safeCompareHex(legacySaltedHash, hash)) return true;

  // 兼容曾经由用户中心生成的无盐 SHA256 密码。
  const legacyUnsaltedHash = createHash('sha256').update(password).digest('hex');
  return safeCompareHex(legacyUnsaltedHash, hash);
}

// 登录阻塞原因（账号存在但状态不允许登录）
export type LoginBlockedReason = 'disabled' | 'pending';

// 验证账号密码（从数据库）
// 返回：UserPayload（成功）| { blocked: 'disabled'|'pending' }（账号存在但被禁用/待分配）| null（用户不存在或密码错误）
export async function verifyCredentials(
  username: string,
  password: string
): Promise<UserPayload | { blocked: LoginBlockedReason } | null> {
  try {
    // 去除前后空格并转小写（用户名不区分大小写）
    const normalizedUsername = username.trim().toLowerCase();
    console.log('[Auth] Verifying credentials for user:', normalizedUsername);
    const client = getSupabaseClient();
    
    const { data, error } = await client
      .from('users')
      .select('*')
      .ilike('username', normalizedUsername)  // 使用 ilike 进行不区分大小写的匹配
      .single();

    if (error) {
      console.error('[Auth] Query user error:', error);
      return null;
    }
    
    if (!data) {
      console.log('[Auth] User not found:', normalizedUsername);
      return null;
    }

    const user = data as { id: number; username: string; name?: string | null; dingtalk_name?: string | null; password_hash: string; role: string; is_disabled: boolean };
    console.log('[Auth] User found, role:', user.role);
    
    // 账号存在但状态不允许登录：明确区分禁用/待分配，避免与"密码错误"混淆
    if (user.is_disabled) {
      console.log('[Auth] User is disabled:', normalizedUsername);
      return { blocked: 'disabled' };
    }
    if (user.role === 'pending') {
      console.log('[Auth] User pending, waiting for permission assignment:', normalizedUsername);
      return { blocked: 'pending' };
    }

    const passwordValid = verifyPassword(password.trim(), user.password_hash);
    
    if (!passwordValid) {
      console.log('[Auth] Password verification failed for user:', normalizedUsername);
      return null;
    }

    if (!user.password_hash.startsWith('scrypt$')) {
      await client
        .from('users')
        .update({ password_hash: hashPassword(password.trim()) })
        .eq('id', user.id);
    }

    // 更新最后登录时间
    await client
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // 确保 role 有有效值
    const userRole: UserRole = (user.role && ['super_admin', 'admin', 'pending'].includes(user.role))
      ? user.role as UserRole 
      : 'admin';
    
    console.log('[Auth] Login successful for user:', username, ', role:', userRole);
    return {
      id: user.id,
      username: user.username,
      name: getUserDisplayName(user),
      dingtalk_name: user.dingtalk_name || undefined,
      role: userRole,
    };
  } catch (error) {
    console.error('Verify credentials error:', error);
    return null;
  }
}

// 获取用户权限码列表
export async function fetchUserPermissions(userId: number, userRole: string): Promise<string[]> {
  try {
    const client = getSupabaseClient();
    // 超级管理员拥有所有权限
    if (isSuperAdminUser(userRole)) {
      const { data } = await client.from('permissions').select('code');
      return data?.map((p: { code: string }) => p.code) || [];
    }

    // 钉钉自动创建的待分配账号不授予任何权限
    if (userRole === 'pending') {
      return [];
    }

    // 优先使用 user_roles 关联表，这是当前权限中心的主数据来源
    const { data: userRoles } = await client
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId);

    if (userRoles && userRoles.length > 0) {
      const roleIds = userRoles.map((ur: { role_id: number }) => ur.role_id);
      const { data: rolePerms } = await client
        .from('role_permissions')
        .select('permission_id')
        .in('role_id', roleIds);

      const permIds = [...new Set((rolePerms || []).map((rp: { permission_id: number }) => rp.permission_id))];
      if (permIds.length === 0) {
        return [];
      }

      const { data: perms } = await client
        .from('permissions')
        .select('code')
        .in('id', permIds);

      return perms?.map((p: { code: string }) => p.code) || [];
    }

    // 兼容旧账号：其他角色按 role_permissions 查询
    // 先通过角色code查找roles表
    const { data: roleRow } = await client
      .from('roles')
      .select('id')
      .eq('code', userRole)
      .single();
    // 如果roles表没有匹配的code（如admin），尝试通过user_id直接查role_permissions
    if (!roleRow) {
      // 方案1: 查询用户是否有自定义权限分配（通过user_id）
      const { data: userPerms } = await client
        .from('user_permissions')
        .select('permission_id')
        .eq('user_id', userId);
      if (userPerms && userPerms.length > 0) {
        const permIds = userPerms.map((up: { permission_id: number }) => up.permission_id);
        const { data: perms } = await client
          .from('permissions')
          .select('code')
          .in('id', permIds);
        return perms?.map((p: { code: string }) => p.code) || [];
      }
      console.warn('[Auth] No role found for code:', userRole, ', denying permissions by default');
      return [];
    }
    // 找到角色，查询角色权限
    const { data } = await client
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', roleRow.id);
    if (!data || data.length === 0) {
      console.warn('[Auth] Role', userRole, 'has no permissions assigned, denying permissions by default');
      return [];
    }
    const permIds = data.map((rp: { permission_id: number }) => rp.permission_id);
    const { data: perms } = await client
      .from('permissions')
      .select('code')
      .in('id', permIds);
    return perms?.map((p: { code: string }) => p.code) || [];
  } catch (err) {
    console.error('[Auth] fetchUserPermissions error:', err);
    return [];
  }
}

// 登录并生成 token
export async function login(
  username: string,
  password: string
): Promise<{ user: UserPayload; token: string } | { blocked: LoginBlockedReason } | null> {
  const user = await verifyCredentials(username, password);
  if (!user) {
    return null;
  }
  if ('blocked' in user) {
    return user;
  }
  
  // 获取用户权限码并嵌入token
  const permissions = await fetchUserPermissions(user.id, user.role);
  const token = await generateToken({ ...user, permissions });
  return { user, token };
}

// 获取所有管理员
export async function getAllAdmins(userId: number): Promise<Array<{ id: number; username: string; role: string; created_at: string; last_login: string | null }> | null> {
  try {
    void userId;
    const client = getSupabaseClient();
    
    const { data, error } = await client
      .from('users')
      .select('id, username, role, created_at, last_login')
      .order('id', { ascending: true });

    if (error) {
      console.error('Get all admins error:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Get all admins error:', error);
    return null;
  }
}

// 创建管理员
export async function createAdmin(username: string, password: string, role: UserRole = 'admin'): Promise<{ success: boolean; error?: string }> {
  if (!username || !password) {
    return { success: false, error: '账号和密码不能为空' };
  }

  if (username.length < 3 || username.length > 50) {
    return { success: false, error: '账号长度需在 3-50 字符之间' };
  }

  if (password.length < 6) {
    return { success: false, error: '密码长度至少 6 位' };
  }

  try {
    const client = getSupabaseClient();
    
    // 检查账号是否已存在
    const { data: existing } = await client
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      return { success: false, error: '账号已存在' };
    }

    // 创建新管理员
    const { error } = await client
      .from('users')
      .insert({
        username,
        password_hash: hashPassword(password),
        role,
      });

    if (error) {
      console.error('Create admin error:', error);
      return { success: false, error: '创建失败' };
    }

    return { success: true };
  } catch (error) {
    console.error('Create admin error:', error);
    return { success: false, error: '创建失败' };
  }
}

// 修改密码
export async function updateAdminPassword(adminId: number, newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: '密码长度至少 6 位' };
  }

  try {
    const client = getSupabaseClient();
    
    const { error } = await client
      .from('users')
      .update({ password_hash: hashPassword(newPassword) })
      .eq('id', adminId);

    if (error) {
      console.error('Update password error:', error);
      return { success: false, error: '修改失败' };
    }

    return { success: true };
  } catch (error) {
    console.error('Update password error:', error);
    return { success: false, error: '修改失败' };
  }
}

// 删除管理员
export async function deleteAdmin(adminId: number, currentUserId: number): Promise<{ success: boolean; error?: string }> {
  // 不能删除自己
  if (currentUserId === adminId) {
    return { success: false, error: '不能删除自己的账号' };
  }

  try {
    const client = getSupabaseClient();
    
    const { error } = await client
      .from('users')
      .delete()
      .eq('id', adminId);

    if (error) {
      console.error('Delete admin error:', error);
      return { success: false, error: '删除失败' };
    }

    return { success: true };
  } catch (error) {
    console.error('Delete admin error:', error);
    return { success: false, error: '删除失败' };
  }
}

// 初始化默认超级管理员（仅首次部署使用，已有用户时直接返回）
// 安全策略：不再使用硬编码默认密码，改为生成 12 位随机强密码并一次性返回，
// 调用方必须在响应中展示给部署者，且应提示首次登录后立即修改。
export async function initDefaultAdmin(): Promise<{
  initialized: boolean;
  message: string;
  error?: string;
  initialPassword?: string;
}> {
  try {
    const client = getSupabaseClient();

    // 检查数据库是否已有任何用户
    const { data: existingUsers } = await client
      .from('users')
      .select('id')
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      // 已有用户，初始化接口永久禁用
      return {
        initialized: true,
        message: '系统已初始化',
      };
    }

    // 首次部署：创建默认超级管理员（随机强密码，一次性返回）
    const initialPassword = generateInitialPassword();
    const defaultPasswordHash = hashPassword(initialPassword);

    const { error: createError } = await client
      .from('users')
      .insert({
        username: 'admin',
        password_hash: defaultPasswordHash,
        role: 'super_admin',
      });

    if (createError) {
      return {
        initialized: false,
        message: '创建默认管理员失败: ' + (createError.message || '未知错误'),
        error: '创建默认管理员失败: ' + (createError.message || '未知错误'),
      };
    }

    return {
      initialized: true,
      message: '已创建默认超级管理员，初始密码仅在本次返回，请立即修改',
      initialPassword,
    };
  } catch (error) {
    return {
      initialized: false,
      message: '初始化失败: ' + (error instanceof Error ? error.message : '未知错误'),
      error: '初始化失败: ' + (error instanceof Error ? error.message : '未知错误'),
    };
  }
}

/** 生成 12 位随机初始密码（含大小写字母、数字、符号，规避弱密码） */
export function generateInitialPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  const randomInt = (max: number) => Math.floor(cryptoRandomValue() * max);
  const chars = [
    upper[randomInt(upper.length)],
    lower[randomInt(lower.length)],
    digits[randomInt(digits.length)],
    symbols[randomInt(symbols.length)],
  ];
  for (let i = 4; i < 12; i += 1) {
    chars.push(all[randomInt(all.length)]);
  }
  // Fisher-Yates 洗牌，避免前缀可预测
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** 加密安全随机数（0 ≤ value < 1） */
function cryptoRandomValue(): number {
  const buf = randomBytes(4);
  return buf.readUInt32BE(0) / 0x100000000;
}
