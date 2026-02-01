export const getEnv = (key: string): string => {
  return (window as any).env[key];
};
