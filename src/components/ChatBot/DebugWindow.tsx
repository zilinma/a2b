import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, Paper } from '@mui/material';
import { ChangeRecord, StateSnapshot } from './types';

interface DebugWindowProps {
  isOpen: boolean;
  onClose: () => void;
  changeHistory: ChangeRecord[];
  showFullState: boolean;
  toggleFullState: () => void;
  lastDiffResult: { summary: string | null; details: string | null } | null;
  clearHistory: () => void;
  createSnapshot: () => StateSnapshot;
}

export const DebugWindow: React.FC<DebugWindowProps> = ({
  isOpen,
  onClose,
  changeHistory,
  showFullState,
  toggleFullState,
  lastDiffResult,
  clearHistory,
  createSnapshot,
}) => {
  // Local state for snapshot
  const [currentSnapshot, setCurrentSnapshot] = useState<StateSnapshot | null>(null);
  
  // Update snapshot when opened
  useEffect(() => {
    if (isOpen) {
      const snapshot = createSnapshot();
      setCurrentSnapshot(snapshot);
    }
  }, [isOpen, createSnapshot]);

  if (!isOpen) return null;

  return (
    <>
      {/* Debug Status Indicator */}
      <Box
        sx={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          backgroundColor: '#2e7d32',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 1000,
        }}
      >
        Debug Mode Active
      </Box>

      {/* Floating Debug Window */}
      <Paper
        elevation={4}
        sx={{
          position: 'fixed',
          top: '50px',
          left: '50px',
          width: '600px',
          height: '80vh',
          maxHeight: 'calc(100vh - 100px)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1100,
          overflow: 'hidden',
          backgroundColor: '#1e1e1e',
          color: '#f8f8f8',
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          resize: 'both',
        }}
      >
        {/* Debug Header */}
        <Box
          sx={{
            p: 1.5,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #333',
            backgroundColor: '#333',
          }}
        >
          <Typography variant="h6" sx={{ fontSize: '16px', color: '#fff' }}>
            AI Assistant Debug Panel
          </Typography>
          <Box>
            <Button
              variant="outlined"
              size="small"
              onClick={onClose}
              sx={{ color: '#fff', borderColor: '#fff', fontSize: '10px' }}
            >
              Close
            </Button>
          </Box>
        </Box>

        {/* Debug Content */}
        <Box
          sx={{
            p: 2,
            overflowY: 'auto',
            flexGrow: 1,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Box>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  const snapshot = createSnapshot();
                  setCurrentSnapshot(snapshot);
                }}
                sx={{ color: '#4caf50', borderColor: '#4caf50', fontSize: '10px', mr: 1 }}
              >
                Refresh State
              </Button>

              <Button
                variant="outlined"
                size="small"
                onClick={clearHistory}
                sx={{ color: '#ff9800', borderColor: '#ff9800', fontSize: '10px' }}
              >
                Clear History
              </Button>
            </Box>
          </Box>

          <Typography variant="body2" sx={{ mb: 1, mt: 2, color: '#0f0' }}>
            Change History ({changeHistory.length})
          </Typography>

          {changeHistory.length === 0 ? (
            <Typography variant="body2" sx={{ color: '#999' }}>
              No changes recorded yet
            </Typography>
          ) : (
            changeHistory.map((change, index) => (
              <Box key={index} sx={{ mb: 2, p: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: '#ff0', display: 'block' }}>
                  {new Date(change.timestamp).toLocaleTimeString()}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1, color: '#0f0' }}>
                  {change.summary}
                </Typography>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    color: '#ccc',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    padding: '8px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '4px',
                  }}
                >
                  {change.details}
                </pre>
              </Box>
            ))
          )}

          <Typography variant="body2" sx={{ mt: 2, mb: 1, color: '#0f0' }}>
            Current Snapshot Info
          </Typography>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              color: '#ccc',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '4px',
            }}
          >
            {currentSnapshot
              ? JSON.stringify(
                  {
                    caseFile: currentSnapshot.caseFile ? 'Present' : 'Not set',
                    ioa: currentSnapshot.ioa ? 'Present' : 'Not set',
                    iceberg: currentSnapshot.iceberg ? 'Present' : 'Not set',
                    issues: currentSnapshot.issues || [],
                    boundaries: currentSnapshot.boundaries || [],
                    scenarios: currentSnapshot.scenarios || [],
                    timestamp: new Date(currentSnapshot.timestamp).toLocaleString(),
                  },
                  null,
                  2
                )
              : 'No snapshot available'}
          </pre>

          <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, mb: 1 }}>
            <Typography variant="body2" sx={{ color: '#0f0', flex: 1 }}>
              Full State Preview
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={toggleFullState}
              sx={{ color: '#03a9f4', borderColor: '#03a9f4', fontSize: '10px' }}
            >
              {showFullState ? 'Hide Details' : 'Show Details'}
            </Button>
          </Box>

          {showFullState && currentSnapshot && (
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                color: '#ccc',
                maxHeight: '300px',
                overflowY: 'auto',
                padding: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '4px',
              }}
            >
              {JSON.stringify(currentSnapshot, null, 2)}
            </pre>
          )}
        </Box>
      </Paper>
    </>
  );
}; 