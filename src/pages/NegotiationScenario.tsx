import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Container,
  Typography,
  Button,
  Box,
  Paper,
  Grid,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Collapse,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { RootState } from '../store';
import { 
  setScenarios, 
  selectScenario, 
  addRiskAssessment, 
  updateRiskAssessment, 
  setRiskAssessments,
  Scenario,
  RiskAssessment
} from '../store/negotiationSlice';
import { 
  setScenariosRecalculated,
  setRiskAssessmentsRecalculated 
} from '../store/recalculationSlice';
import { api } from '../services/api';
import LoadingOverlay from '../components/LoadingOverlay';
import ScenarioSpectrum from '../components/ScenarioSpectrum';
import RiskAssessmentTable from '../components/RiskAssessmentTable';
import RecalculationWarning from '../components/RecalculationWarning';

const NegotiationScenario = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  const { currentCase, selectedScenario } = useSelector(
    (state: RootState) => state.negotiation
  );
  const recalculationStatus = useSelector((state: RootState) => state.recalculation);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingRisk, setIsGeneratingRisk] = useState(false);
  const [showRiskAssessment, setShowRiskAssessment] = useState(false);
  
  // Get filtered scenarios for the selected issue
  const filteredScenarios = currentCase?.scenarios.filter(
    s => s.componentId === selectedIssueId
  ) || [];

  // Check if analysis has been recalculated but scenarios haven't been updated
  const needsRecalculation = !recalculationStatus.scenariosRecalculated && 
    recalculationStatus.analysisRecalculated;

  useEffect(() => {
    if (!currentCase || !currentCase.analysis) {
      navigate('/boundaries');
      return;
    }

    // Set the first component as selected by default
    if (currentCase.analysis.components.length > 0 && !selectedIssueId) {
      setSelectedIssueId(currentCase.analysis.components[0].id);
    }
  }, [currentCase, navigate, selectedIssueId]);

  // Use a separate effect for scenario generation to prevent infinite loops
  useEffect(() => {
    // Skip if already generating or no issue selected
    if (isGenerating || !selectedIssueId || !currentCase) {
      return;
    }

    const fetchScenarios = async () => {
      // Check if we already have scenarios for this issue in Redux
      const existingScenarios = currentCase.scenarios.filter(
        (s) => s.componentId === selectedIssueId
      );
      
      // If we have scenarios and they don't need recalculation, use them
      if (existingScenarios.length > 0 && recalculationStatus.scenariosRecalculated) {
        console.log(`Using existing scenarios for issue: ${selectedIssueId}`);
        return;
      }

      // Only proceed with generation if we need to
      setIsGenerating(true);
      setLoading(true);
      setError(null);
      
      try {
        console.log(`Starting scenario generation for issue: ${selectedIssueId}`);
        
        // Use regular generateScenarios instead of forceGenerateScenarios to use cache if available
        const newScenarios = await api.generateScenarios(selectedIssueId);
        
        // Ensure newScenarios is an array
        const scenariosArray = Array.isArray(newScenarios) ? newScenarios : [];
        console.log(`Generated ${scenariosArray.length} scenarios for issue: ${selectedIssueId}`);
        
        dispatch(setScenarios(scenariosArray));
        
        // Mark scenarios as recalculated if they were generated due to analysis changes
        if (!recalculationStatus.scenariosRecalculated) {
          dispatch(setScenariosRecalculated(true));
        }
      } catch (err: any) {
        if (err.message?.includes('rate limit')) {
          setError('Rate limit reached. Please wait a moment before trying again.');
        } else {
          console.error(`Error generating scenarios for issue ${selectedIssueId}:`, err);
          setError('Failed to fetch scenarios. Please try again.');
        }
      } finally {
        setLoading(false);
        setIsGenerating(false);
      }
    };

    fetchScenarios();
  }, [selectedIssueId, currentCase, dispatch, recalculationStatus.scenariosRecalculated, isGenerating]);

  const handleIssueChange = (issueId: string) => {
    if (isGenerating) {
      setError('Please wait for the current scenario generation to complete');
      return;
    }
    setSelectedIssueId(issueId);
    // Reset selected scenario when changing issues
    dispatch(selectScenario(null));
    setShowRiskAssessment(false);
  };

  const handleSelectScenario = (scenario: Scenario) => {
    if (selectedScenario && selectedScenario.id === scenario.id) {
      dispatch(selectScenario(null));
      setShowRiskAssessment(false);
    } else {
      dispatch(selectScenario(scenario));
      // Don't reset showRiskAssessment here to maintain its state
    }
  };

  const handleGenerateScenarios = async () => {
    if (!selectedIssueId || isGenerating) return;
    
    setLoading(true);
    setError(null);
    setIsGenerating(true);
    
    try {
      console.log(`Manually triggering scenario generation for issue: ${selectedIssueId}`);
      
      // Force regenerate scenarios
      const generatedScenarios = await api.forceGenerateScenarios(selectedIssueId);
      
      // Ensure generatedScenarios is an array
      const scenariosArray = Array.isArray(generatedScenarios) ? generatedScenarios : [];
      console.log(`Generated ${scenariosArray.length} scenarios for issue: ${selectedIssueId}`);
      
      dispatch(setScenarios(scenariosArray));
    } catch (err) {
      console.error(`Error manually generating scenarios for issue ${selectedIssueId}:`, err);
      setError('Failed to generate scenarios. Please try again.');
    } finally {
      setLoading(false);
      setIsGenerating(false);
    }
  };

  const handleGenerateRiskAssessment = async () => {
    if (!currentCase || !selectedScenario) {
      setError('Please select a scenario first.');
      return;
    }
    
    // Toggle visibility of risk assessment
    setShowRiskAssessment(!showRiskAssessment);
    
    // If we're showing the risk assessment and it doesn't exist yet, generate it
    if (!showRiskAssessment && !currentCase.riskAssessments.some(ra => ra.scenarioId === selectedScenario.id)) {
      try {
        setIsGeneratingRisk(true);
        setError(null);
        
        // Generate risk assessment
        const riskAssessment = await api.generateRiskAssessment(selectedScenario.id);
        
        // Add to Redux
        dispatch(setRiskAssessments([...currentCase.riskAssessments, riskAssessment]));
        
        // Mark risk assessments as recalculated
        dispatch(setRiskAssessmentsRecalculated(true));
      } catch (err) {
        console.error('Error generating risk assessment:', err);
        setError('Failed to generate risk assessment. Please try again.');
        setShowRiskAssessment(false); // Hide on error
      } finally {
        setIsGeneratingRisk(false);
      }
    }
  };

  const handleAddAssessment = (assessment: RiskAssessment) => {
    dispatch(addRiskAssessment(assessment));
  };

  const handleUpdateRiskAssessment = (assessment: RiskAssessment) => {
    dispatch(updateRiskAssessment(assessment));
  };

  const handleDeleteAssessment = (assessmentId: string) => {
    if (!currentCase) return;
    
    const updatedAssessments = currentCase.riskAssessments.filter(
      (assessment) => assessment.id !== assessmentId
    );
    
    dispatch(setRiskAssessments(updatedAssessments));
  };

  const handleNext = () => {
    navigate('/');
  };

  const handleUpdateScenario = (updatedScenario: Scenario) => {
    if (!currentCase) return;
    
    // Update the scenario in the scenarios array
    const updatedScenarios = currentCase.scenarios.map(scenario => 
      scenario.id === updatedScenario.id ? updatedScenario : scenario
    );
    
    // Update Redux store
    dispatch(setScenarios(updatedScenarios));
  };

  if (!currentCase || !currentCase.analysis) {
    return null; // Will redirect in useEffect
  }

  const selectedIssue = currentCase.analysis.components.find(
    (c) => c.id === selectedIssueId
  );

  // Get risk assessments for the selected scenario
  const scenarioRiskAssessments = selectedScenario 
    ? currentCase.riskAssessments.filter(ra => ra.scenarioId === selectedScenario.id)
    : [];

  // Get party names for display
  const party1Name = currentCase?.suggestedParties[0]?.name || 'Party 1';
  const party2Name = currentCase?.suggestedParties[1]?.name || 'Party 2';

  return (
    <Container maxWidth="xl">
      <Paper elevation={3} sx={{ p: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Negotiation Scenarios
        </Typography>
        
        <Divider sx={{ mb: 4 }} />
        
        {error && (
          <Alert severity={error.includes('successfully') ? 'success' : 'error'} sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        
        {needsRecalculation && (
          <RecalculationWarning
            message="The analysis has been modified. The scenarios may not reflect the latest changes."
            onRecalculate={handleGenerateScenarios}
          />
        )}
        
        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Select Issue
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Choose an issue to view its potential scenarios
              </Typography>
              
              <List dense sx={{ bgcolor: 'background.paper', border: '1px solid #eee', borderRadius: 1 }}>
                {currentCase.analysis.components.map((component) => (
                  <ListItem
                    key={component.id}
                    button
                    selected={selectedIssueId === component.id}
                    onClick={() => handleIssueChange(component.id)}
                  >
                    <ListItemText
                      primary={component.name}
                      primaryTypographyProps={{
                        variant: 'body2',
                        fontWeight: selectedIssueId === component.id ? 'bold' : 'normal'
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={8}>
            {selectedIssueId ? (
              <>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Scenario Spectrum
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Click on a scenario to view its risk assessment. Click the edit icon to modify a scenario's description.
                  </Typography>
                  
                  <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={handleGenerateScenarios}
                      disabled={isGenerating}
                      startIcon={isGenerating ? <CircularProgress size={16} /> : null}
                      sx={{ fontSize: '0.8rem' }}
                      size="small"
                    >
                      Regenerate Scenarios
                    </Button>
                  </Box>
                  
                  <ScenarioSpectrum
                    scenarios={filteredScenarios}
                    party1Name={party1Name}
                    party2Name={party2Name}
                    onSelectScenario={handleSelectScenario}
                    onUpdateScenario={handleUpdateScenario}
                    selectedScenarioId={selectedScenario?.id}
                    riskAssessmentContent={
                      selectedScenario && showRiskAssessment && (
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="h6" gutterBottom>
                            Risk Assessment
                          </Typography>
                          <RiskAssessmentTable
                            assessments={currentCase.riskAssessments}
                            scenarioId={selectedScenario.id}
                            viewMode="edit"
                            onAddAssessment={handleAddAssessment}
                            onUpdateAssessment={handleUpdateRiskAssessment}
                            onDeleteAssessment={handleDeleteAssessment}
                          />
                        </Box>
                      )
                    }
                  />
                </Box>

                {selectedScenario && (
                  <Box sx={{ mt: 3, mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={handleGenerateRiskAssessment}
                      disabled={isGeneratingRisk}
                      startIcon={isGeneratingRisk ? <CircularProgress size={16} /> : null}
                      sx={{ fontSize: '0.8rem' }}
                      size="small"
                    >
                      {isGeneratingRisk 
                        ? 'Generating Risk Assessment...' 
                        : showRiskAssessment 
                          ? 'Hide Risk Assessment' 
                          : currentCase.riskAssessments.some(ra => ra.scenarioId === selectedScenario.id)
                            ? 'Show Risk Assessment'
                            : 'Generate Risk Assessment'}
                    </Button>
                  </Box>
                )}
              </>
            ) : (
              <Paper elevation={0} sx={{ p: 3, textAlign: 'center', bgcolor: '#f5f5f5' }}>
                <Typography variant="body1" color="text.secondary">
                  Select an issue from the list to view its scenarios
                </Typography>
              </Paper>
            )}
          </Grid>
        </Grid>
      </Paper>
      
      {loading && <LoadingOverlay open={loading} message="Generating scenarios..." />}
    </Container>
  );
};

export default NegotiationScenario; 