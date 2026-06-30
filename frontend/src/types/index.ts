export type PaymentMethod = 'OUT_OF_POCKET' | 'DIRECT_HSA';
export type ReimbursementStatus = 'PENDING' | 'REIMBURSED' | 'NA';

export interface User {
  id: string;
  email: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Category {
  id: string;
  name: string;
  isCustom: boolean;
  userId: string | null;
}

export interface Receipt {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface Expense {
  id: string;
  date: string;
  familyMemberId: string;
  categoryId: string;
  provider: string;
  amount: string;
  paymentMethod: PaymentMethod;
  reimbursementStatus: ReimbursementStatus;
  reimbursementDate: string | null;
  notes: string | null;
  createdAt: string;
  familyMember: FamilyMember;
  category: Category;
  receipts: Receipt[];
}

export interface ExpenseFilters {
  memberId?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethod | '';
  status?: ReimbursementStatus | '';
  dateFrom?: string;
  dateTo?: string;
  year?: string;
  page?: number;
}

export interface ExpensesResponse {
  expenses: Expense[];
  total: number;
  page: number;
  pages: number;
}

export interface Summary {
  totalByMember: { memberId: string; memberName: string; total: string }[];
  totalByCategory: { categoryId: string; categoryName: string; total: string }[];
  totalPendingReimbursement: string;
  totalReimbursedYTD: string;
  totalReimbursedAllTime: string;
  totalDirectHSA: string;
}
