import { useEffect, useRef } from 'react';
import { Box, Typography, Paper, Grid, Chip } from '@mui/material';
import * as d3 from 'd3';
import { Scenario, Component } from '../store/negotiationSlice';

interface ScenarioSpectrumProps {
  scenarios: Scenario[];
  onSelectScenario: (scenario: Scenario) => void;
  selectedScenarioId?: string;
  component?: Component;
  party1Name?: string;
  party2Name?: string;
}

const ScenarioSpectrum = ({ 
  scenarios, 
  onSelectScenario, 
  selectedScenarioId,
  component,
  party1Name = 'Party 1',
  party2Name = 'Party 2'
}: ScenarioSpectrumProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Get scenario by type
  const getScenarioByType = (type: string) => {
    return scenarios.find(s => s.type === type);
  };
  
  // Color mapping for scenario types
  const getColorForType = (type: string) => {
    switch (type) {
      case 'redline_violated_p1':
        return "#ff5252";
      case 'bottomline_violated_p1':
        return "#ff9800";
      case 'agreement_area':
        return "#4caf50";
      case 'bottomline_violated_p2':
        return "#ff9800";
      case 'redline_violated_p2':
        return "#ff5252";
      default:
        return "#ccc";
    }
  };
  
  useEffect(() => {
    if (!svgRef.current || scenarios.length === 0) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
    const width = svgRef.current.clientWidth;
    const height = 80; // Reduced height since we'll show boxes below
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    
    // Create a scale for the spectrum
    const x = d3.scaleLinear()
      .domain([0, 4])  // 5 scenarios (0-4)
      .range([0, innerWidth]);
    
    // Create the main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Draw the line
    g.append("line")
      .attr("x1", 0)
      .attr("y1", 30)
      .attr("x2", innerWidth)
      .attr("y2", 30)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 3);
    
    // Draw the scenario points
    g.selectAll("circle")
      .data(scenarios)
      .enter()
      .append("circle")
      .attr("cx", (d, i) => x(i))
      .attr("cy", 30)
      .attr("r", 10)
      .attr("fill", d => getColorForType(d.type))
      .attr("stroke", d => selectedScenarioId === d.id ? "#000" : "none")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        onSelectScenario(d);
      });
    
    // Add small labels for the points (just numbers 1-5)
    g.selectAll("text.point-label")
      .data(scenarios)
      .enter()
      .append("text")
      .attr("class", "point-label")
      .attr("x", (d, i) => x(i))
      .attr("y", 10)
      .attr("text-anchor", "middle")
      .attr("fill", "#000")
      .style("font-size", "10px")
      .text((d, i) => i + 1);
    
  }, [scenarios, selectedScenarioId, party1Name, party2Name]);
  
  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        {/* Legend */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Chip 
            label={`${party1Name} Redline Violated`} 
            sx={{ bgcolor: "#ff5252", color: "white", mr: 1 }} 
          />
          <Chip 
            label={`${party1Name} Bottomline Violated`} 
            sx={{ bgcolor: "#ff9800", color: "white", mr: 1 }} 
          />
          <Chip 
            label="Agreement Area" 
            sx={{ bgcolor: "#4caf50", color: "white", mr: 1 }} 
          />
          <Chip 
            label={`${party2Name} Bottomline Violated`} 
            sx={{ bgcolor: "#ff9800", color: "white", mr: 1 }} 
          />
          <Chip 
            label={`${party2Name} Redline Violated`} 
            sx={{ bgcolor: "#ff5252", color: "white" }} 
          />
        </Box>
        
        {/* Spectrum visualization */}
        <svg ref={svgRef} width="100%" height="80"></svg>
      </Paper>
      
      {/* Scenario boxes */}
      <Grid container spacing={2}>
        {scenarios.map((scenario, index) => (
          <Grid item xs={12} sm={6} md={4} lg={2.4} key={scenario.id}>
            <Paper 
              variant="outlined" 
              sx={{ 
                p: 2, 
                height: '100%',
                cursor: 'pointer',
                borderColor: selectedScenarioId === scenario.id ? 'primary.main' : 'divider',
                borderWidth: selectedScenarioId === scenario.id ? 2 : 1,
                bgcolor: selectedScenarioId === scenario.id ? 'action.selected' : 'background.paper'
              }}
              onClick={() => onSelectScenario(scenario)}
            >
              <Typography variant="subtitle2" gutterBottom sx={{ 
                color: getColorForType(scenario.type),
                fontWeight: 'bold'
              }}>
                Scenario {index + 1}
              </Typography>
              <Typography variant="body2">
                {scenario.description}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ScenarioSpectrum; 