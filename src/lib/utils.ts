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

export const CATEGORY_ORDER = [
  "VODKA",
  "GIN",
  "RUM",
  "WHISKEY",
  "TEQUILA",
  "LIQUORI/CREME",
  "VERMOUTH",
  "BIBITE",
  "SUCCHI",
  "SCIROPPI"
];

const PRODUCT_ORDER = [
  "WYBOROWA LT", "KEGLEVICH FRAGOLA LT", "KEGLEVICH MELONE LT", "KEGLEVICH PESCA LT",
  "BEEFEATER LT",
  "BACARDI BLANCO",
  "JACK DANIELS LT",
  "TEQUILA OLMECA",
  "AMARETTO", "TRIPLE SEC", "SARURI", "MENTA BIANCA", "SAMBUCA RAMAZZOTTI LT", "PASSOA LT", "BLUE CURACAO", "ELDERFLOWER", "MALIBU LT", "JAGERMEISTER LT",
  "APEROL LT", "MARTINI ROSSO", "BITTER LT",
  "PROSECCO", "ACQUA NATIA 0,50", "ACQUA FERRARELLE 0,50", "COCA COLA 0,33CL", "COCA COLA ZERO 0,33CL LATTINA", "PEPSI 2LT", "FEVER TREE INDIAN", "FEVER TREE MEDITERRANEAN", "GINGER BEER ECONOMICA", "RED BULL", "REDBULL ZERO", "SCHWEPPES LEMON LT", "SCHWEPPES TONICA LT", "SCHWEPPES SODA POMPELMO ROSA LT",
  "SUCCO ARANCIA LT", "SUCCO ANANAS LT",
  "SCIR. DI FRAGOLA ABACA", "SOUR MIX ABACA", "SCIR. DI COCCO ABACA"
];

export function sortProducts<T extends { name: string, category: string }>(products: T[]): T[] {
  return [...products].sort((a, b) => {
    const catA = CATEGORY_ORDER.indexOf(a.category);
    const catB = CATEGORY_ORDER.indexOf(b.category);
    
    if (catA !== catB) {
      if (catA === -1) return 1;
      if (catB === -1) return -1;
      return catA - catB;
    }
    
    const nameA = PRODUCT_ORDER.indexOf(a.name);
    const nameB = PRODUCT_ORDER.indexOf(b.name);
    
    if (nameA !== -1 && nameB !== -1) return nameA - nameB;
    if (nameA !== -1) return -1;
    if (nameB !== -1) return 1;
    
    return a.name.localeCompare(b.name);
  });
}
