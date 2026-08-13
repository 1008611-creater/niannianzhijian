export function quickRunErrorMessage(error?: string): string | undefined {
  if (!error) return undefined;
  if (/\b429\b|rate[ -]?limit|too many requests/i.test(error)) {
    return '当前理解服务繁忙，素材和已完成的分析都已保留。请稍后重新制作。';
  }
  return error;
}
