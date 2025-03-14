import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface RecalculationStatus {
  analysisRecalculated: boolean;
  scenariosRecalculated: boolean;
  lastRecalculationTimestamp: string | null;
}

const initialState: RecalculationStatus = {
  analysisRecalculated: true,
  scenariosRecalculated: true,
  lastRecalculationTimestamp: null,
};

export const recalculationSlice = createSlice({
  name: 'recalculation',
  initialState,
  reducers: {
    setAnalysisRecalculated: (state, action: PayloadAction<boolean>) => {
      state.analysisRecalculated = action.payload;
      if (action.payload) {
        state.scenariosRecalculated = false;
        state.lastRecalculationTimestamp = new Date().toISOString();
      }
    },
    setScenariosRecalculated: (state, action: PayloadAction<boolean>) => {
      state.scenariosRecalculated = action.payload;
      if (action.payload) {
        state.lastRecalculationTimestamp = new Date().toISOString();
      }
    },
    resetRecalculationStatus: (state) => {
      state.analysisRecalculated = true;
      state.scenariosRecalculated = true;
      state.lastRecalculationTimestamp = new Date().toISOString();
    },
  },
});

export const {
  setAnalysisRecalculated,
  setScenariosRecalculated,
  resetRecalculationStatus,
} = recalculationSlice.actions;

export default recalculationSlice.reducer; 