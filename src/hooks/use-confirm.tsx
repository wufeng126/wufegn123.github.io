'use client';

/**
 * 统一危险确认钩子（替代全局 confirm() / window.confirm）
 *
 * 设计背景：修复审查发现高危操作确认体系混乱——43 处原生 confirm() 与
 * AlertDialog 并存。本钩子提供一致的确认弹窗：
 * - 危险操作（删除/作废/归档等）使用 destructive 红色确认按钮 + 后果描述
 * - 基于 Radix AlertDialog，支持键盘 Esc / 遮罩关闭 / 焦点管理
 *
 * 用法：
 *   const confirm = useConfirm();
 *   if (!await confirm({ title: '删除工人', description: '删除后不可恢复', variant: 'destructive' })) return;
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** destructive = 危险操作（红色确认按钮） */
  variant?: 'default' | 'destructive';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const close = useCallback(
    (result: boolean) => {
      setState((current) => {
        current?.resolve(result);
        return null;
      });
    },
    []
  );

  const isDestructive = state?.options.variant === 'destructive';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={state !== null}
        onOpenChange={(open) => {
          // Esc / 遮罩点击视为取消
          if (!open) close(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state?.options.title}</AlertDialogTitle>
            {state?.options.description && (
              <AlertDialogDescription>{state?.options.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>
              {state?.options.cancelText || '取消'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => close(true)}
              className={
                isDestructive
                  ? 'bg-destructive text-white hover:bg-destructive/90'
                  : undefined
              }
            >
              {state?.options.confirmText || '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/** 在组件中获取确认函数：const confirm = useConfirm(); */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}
