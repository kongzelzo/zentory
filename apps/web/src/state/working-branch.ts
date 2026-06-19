import { create } from "zustand";

const key = "zentory.working-branch.v1";

type WorkingBranchState = {
  workingBranchId: string;
  setWorkingBranchId: (branchId: string) => void;
};

function loadWorkingBranchId() {
  return localStorage.getItem(key) ?? "";
}

export const useWorkingBranch = create<WorkingBranchState>((set) => ({
  workingBranchId: loadWorkingBranchId(),
  setWorkingBranchId: (branchId) => {
    localStorage.setItem(key, branchId);
    set({ workingBranchId: branchId });
  }
}));
