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
import { setScenarios, selectScenario, addRiskAssessment, updateRiskAssessment, setRiskAssessments } from '../store/negotiationSlice';
import { api } from '../services/api';
import LoadingOverlay from '../components/LoadingOverlay';
import ScenarioSpectrum from '../components/ScenarioSpectrum';
import RiskAssessmentTable from '../components/RiskAssessmentTable';

const NegotiationScenario = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  const { currentCase, selectedScenario } = useSelector(
    (state: RootState) => state.negotiation
  );
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string>('');
  const [scenarios, setLocalScenarios] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingRisk, setIsGeneratingRisk] = useState(false);
  const generationInProgress = useRef(false);
  const [showRiskAssessment, setShowRiskAssessment] = useState(false);

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
    if (generationInProgress.current || !selectedIssueId || !currentCase) {
      return;
    }

    const fetchScenarios = async () => {
      // Set flags to prevent multiple calls
      setIsGenerating(true);
      generationInProgress.current = true;
      setLoading(true);
      setError(null);
      
      try {
        console.log(`Starting scenario generation for issue: ${selectedIssueId}`);
        
        // Check if we already have scenarios for this issue in Redux
        const existingScenarios = currentCase.scenarios.filter(
          (s) => s.componentId === selectedIssueId
        );
        
        if (existingScenarios.length > 0) {
          console.log(`Using existing scenarios for issue: ${selectedIssueId}`);
          setLocalScenarios(existingScenarios);
        } else {
          console.log(`No existing scenarios, generating new ones for issue: ${selectedIssueId}`);
          // Use regular generateScenarios instead of forceGenerateScenarios to use cache if available
          const newScenarios = await api.generateScenarios(selectedIssueId);
          
          // Ensure newScenarios is an array
          const scenariosArray = Array.isArray(newScenarios) ? newScenarios : [];
          console.log(`Generated ${scenariosArray.length} scenarios for issue: ${selectedIssueId}`);
          
          setLocalScenarios(scenariosArray);
          dispatch(setScenarios(scenariosArray));
        }
      } catch (err) {
        console.error(`Error generating scenarios for issue ${selectedIssueId}:`, err);
        setError('Failed to fetch scenarios. Please try again.');
        setLocalScenarios([]);
      } finally {
        setLoading(false);
        setIsGenerating(false);
        generationInProgress.current = false;
      }
    };

    fetchScenarios();
  }, [selectedIssueId, currentCase, dispatch]);

  const handleIssueChange = (issueId: string) => {
    if (isGenerating) {
      setError('Please wait for the current scenario generation to complete');
      return;
    }
    setSelectedIssueId(issueId);
    // Reset selected scenario when changing issues
    dispatch(selectScenario(null as any));
    setShowRiskAssessment(false);
  };

  const handleSelectScenario = (scenario: any) => {
    dispatch(selectScenario(scenario));
    setShowRiskAssessment(false);
  };

  const handleGenerateScenarios = async () => {
    if (!selectedIssueId || isGenerating) return;
    
    setLoading(true);
    setError(null);
    setIsGenerating(true);
    generationInProgress.current = true;
    
    try {
      console.log(`Manually triggering scenario generation for issue: ${selectedIssueId}`);
      
      // Force regenerate scenarios
      const generatedScenarios = await api.forceGenerateScenarios(selectedIssueId);
      
      // Ensure generatedScenarios is an array
      const scenariosArray = Array.isArray(generatedScenarios) ? generatedScenarios : [];
      console.log(`Generated ${scenariosArray.length} scenarios for issue: ${selectedIssueId}`);
      
      setLocalScenarios(scenariosArray);
      dispatch(setScenarios(scenariosArray));
    } catch (err) {
      console.error(`Error manually generating scenarios for issue ${selectedIssueId}:`, err);
      setError('Failed to generate scenarios. Please try again.');
    } finally {
      setLoading(false);
      setIsGenerating(false);
      generationInProgress.current = false;
    }
  };

  const handleGenerateRiskAssessment = async () => {
    if (!selectedScenario) {
      setError('Please select a scenario first.');
      return;
    }
    
    setIsGeneratingRisk(true);
    setError(null);
    
    try {
      // Check if we already have risk assessments for this scenario
      const existingAssessments = currentCase?.riskAssessments.filter(
        (ra) => ra.scenarioId === selectedScenario.id
      ) || [];
      
      if (existingAssessments.length === 0 && currentCase) {
        // Generate risk assessment
        const riskAssessment = await api.generateRiskAssessment(selectedScenario.id);
        
        // Add to Redux
        dispatch(setRiskAssessments([...currentCase.riskAssessments, ...riskAssessment as any]));
      }
      
      // Show the risk assessment section
      setShowRiskAssessment(true);
    } catch (err) {
      console.error('Error generating risk assessment:', err);
      setError('Failed to generate risk assessment. Please try again.');
    } finally {
      setIsGeneratingRisk(false);
    }
  };

  const handleAddAssessment = (assessment: any) => {
    dispatch(addRiskAssessment(assessment));
  };

  const handleUpdateRiskAssessment = (assessment: any) => {
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

  return (
    <Container maxWidth="xl">
      <Paper elevation={3} sx={{ p: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Negotiation Scenarios
        </Typography>
        
        <Divider sx={{ mb: 4 }} />
        
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        
        <Grid container spacing={4}>
          {/* Left panel for issue selection */}
          <Grid item xs={12} md={3} sx={{ flexGrow: 0 }}>
            <Typography variant="h6" gutterBottom>
              Negotiation Issues
            </Typography>
            
            <List dense sx={{ bgcolor: 'background.paper', border: '1px solid #eee', borderRadius: 1 }}>
              {currentCase?.analysis?.components.map((component, index) => (
                <ListItem 
                  key={component.id}
                  sx={{ 
                    borderBottom: index < (currentCase.analysis?.components.length || 0) - 1 ? '1px solid #eee' : 'none',
                    bgcolor: selectedIssueId === component.id ? 'action.selected' : 'inherit',
                    py: 1,
                    pr: 2
                  }}
                  button
                  onClick={() => handleIssueChange(component.id)}
                >
                  <Tooltip title={component.name} placement="top" arrow>
                    <ListItemText 
                      primary={component.name} 
                      primaryTypographyProps={{ 
                        variant: 'body2',
                        fontWeight: selectedIssueId === component.id ? 'bold' : 'normal',
                        sx: { 
                          minWidth: '150px',
                          whiteSpace: 'normal',
                          wordWrap: 'break-word',
                          lineHeight: 1.4
                        }
                      }}
                    />
                  </Tooltip>
                </ListItem>
              ))}
            </List>
            
            {selectedIssue && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Selected Issue Details
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Description:</strong> {selectedIssue?.description}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>{currentCase?.party1.name} Redline:</strong> {selectedIssue?.redlineParty1}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>{currentCase?.party1.name} Bottomline:</strong> {selectedIssue?.bottomlineParty1}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>{currentCase?.party2.name} Redline:</strong> {selectedIssue?.redlineParty2}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{currentCase?.party2.name} Bottomline:</strong> {selectedIssue?.bottomlineParty2}
                  </Typography>
                </Paper>
              </Box>
            )}
          </Grid>
          
          {/* Right panel for scenarios and risk assessment */}
          <Grid item xs={12} md={9}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Scenarios
              </Typography>
              <Box>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={() => {
                    // Clear all scenarios from Redux
                    if (currentCase) {
                      dispatch(setScenarios([]));
                      setLocalScenarios([]);
                      setError(null);
                    }
                  }}
                  disabled={loading || isGenerating || !scenarios.length}
                  sx={{ mr: 1 }}
                >
                  Clear All Scenarios
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleGenerateScenarios}
                  disabled={loading || !selectedIssueId || isGenerating}
                  startIcon={isGenerating ? <CircularProgress size={16} /> : null}
                >
                  {isGenerating ? 'Generating...' : 'Generate Scenarios'}
                </Button>
              </Box>
            </Box>
            
            {scenarios.length > 0 ? (
              <>
                <ScenarioSpectrum
                  scenarios={scenarios}
                  party1Name={currentCase?.party1.name || 'Party 1'}
                  party2Name={currentCase?.party2.name || 'Party 2'}
                  onSelectScenario={handleSelectScenario}
                  selectedScenarioId={selectedScenario?.id}
                />
                
                {selectedScenario && (
                  <Box sx={{ mt: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6">
                        Risk Assessment
                      </Typography>
                      <Button
                        variant="outlined"
                        color="primary"
                        onClick={handleGenerateRiskAssessment}
                        disabled={isGeneratingRisk}
                        startIcon={isGeneratingRisk ? <CircularProgress size={16} /> : null}
                      >
                        {isGeneratingRisk ? 'Generating...' : 'Generate Risk Assessment'}
                      </Button>
                    </Box>
                    
                    {showRiskAssessment && (
                      <Accordion defaultExpanded>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="subtitle1">Short-Term Risk Assessment</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Box sx={{ overflowX: 'auto' }}>
                            <RiskAssessmentTable
                              riskAssessment={currentCase.riskAssessments}
                              scenarioId={selectedScenario.id}
                              onAddAssessment={handleAddAssessment}
                              onUpdateAssessment={handleUpdateRiskAssessment}
                              onDeleteAssessment={handleDeleteAssessment}
                              viewMode="short-term"
                            />
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                    )}
                    
                    {showRiskAssessment && (
                      <Accordion defaultExpanded sx={{ mt: 2 }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="subtitle1">Long-Term Risk Assessment</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Box sx={{ overflowX: 'auto' }}>
                            <RiskAssessmentTable
                              riskAssessment={currentCase.riskAssessments}
                              scenarioId={selectedScenario.id}
                              onAddAssessment={handleAddAssessment}
                              onUpdateAssessment={handleUpdateRiskAssessment}
                              onDeleteAssessment={handleDeleteAssessment}
                              viewMode="long-term"
                            />
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                    )}
                  </Box>
                )}
              </>
            ) : (
              <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary">
                  No scenarios generated yet. Select an issue and click "Generate Scenarios".
                </Typography>
              </Paper>
            )}
          </Grid>
          
          <Grid item xs={12} sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleNext}
              disabled={loading}
              size="large"
            >
              Finish
            </Button>
          </Grid>
        </Grid>
      </Paper>
      
      {loading && <LoadingOverlay open={loading} message="Generating scenarios..." />}
    </Container>
  );
};

export default NegotiationScenario; 