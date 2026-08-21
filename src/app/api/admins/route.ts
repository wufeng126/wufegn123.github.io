import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { getAllAdmins, createAdmin, updateAdminPassword, deleteAdmin } from '@/lib/auth-db';

// 获取所有管理员
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const admins = await getAllAdmins(auth.user.id);
    
    if (admins === null) {
      return NextResponse.json(
        { error: '获取管理员列表失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ admins });
  } catch (error) {
    console.error('Get admins error:', error);
    return NextResponse.json(
      { error: '获取管理员列表失败' },
      { status: 500 }
    );
  }
}

// 创建管理员
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { username, password, role } = body;

    const result = await createAdmin(username, password, role);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: '创建成功' });
  } catch (error) {
    console.error('Create admin error:', error);
    return NextResponse.json(
      { error: '创建失败' },
      { status: 500 }
    );
  }
}

// 修改密码
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id, newPassword } = body;

    const result = await updateAdminPassword(id, newPassword);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('Update password error:', error);
    return NextResponse.json(
      { error: '修改失败' },
      { status: 500 }
    );
  }
}

// 删除管理员
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id') || '0');

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: '请指定要删除的管理员ID' },
        { status: 400 }
      );
    }

    const result = await deleteAdmin(id, auth.user.id);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('Delete admin error:', error);
    return NextResponse.json(
      { error: '删除失败' },
      { status: 500 }
    );
  }
}
