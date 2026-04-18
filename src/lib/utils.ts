import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function groupBy<T>(array: T[], keyOrFn: keyof T | ((item: T) => string)): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const group = typeof keyOrFn === 'function' ? keyOrFn(item) : String(item[keyOrFn]);
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

