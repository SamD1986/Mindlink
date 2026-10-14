import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

/**
 * 同步父目录是 POSIX 的持久化语义：重命名/删除后 fsync 目录以保证目录项落盘。
 * Windows 对目录句柄调用 fsync 会抛 EPERM(-4048)，没有等价实现，因此在 win32 上跳过；
 * 其它平台保持原有语义不变。文件本身的 fsync 不受影响，仍然执行。
 */
export async function syncContainingDirectory(directoryPath: string): Promise<void> {
  if (process.platform === 'win32') return;
  const directory = await open(directoryPath, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
