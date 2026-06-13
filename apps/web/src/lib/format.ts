export function baht(value: number | string | null | undefined) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

export function number(value: number | string | null | undefined) {
  return new Intl.NumberFormat("th-TH").format(Number(value ?? 0));
}

export function thaiDate(value: string | Date) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
