import React from 'react';
import './ActivityHeatMap.css';

export default function ActivityHeatMap({ history = [] }) {
  // We'll show the last 28 days (4 weeks)
  const daysToShow = 28;
  const today = new Date();
  
  const toLocalYMD = (dateLike) => {
    const d = new Date(dateLike);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Build the grid data
  const grid = [];
  for (let i = daysToShow - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = toLocalYMD(d);
    
    // Count debates on this day for intensity
    const count = history.filter(h => {
      const debateDate = h.startedAt || h.createdAt;
      return toLocalYMD(debateDate) === dateStr;
    }).length;

    grid.push({
      date: dateStr,
      count,
      isToday: i === 0,
      label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    });
  }

  const getIntensity = (count) => {
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    return 3; // High intensity
  };

  return (
    <div className="heatmap-container">
      <div className="heatmap-header">
        <span className="heatmap-title">Activity Heatmap</span>
        <div className="heatmap-legend">
          <span>Less</span>
          <div className="heatmap-cell level-0" />
          <div className="heatmap-cell level-1" />
          <div className="heatmap-cell level-2" />
          <div className="heatmap-cell level-3" />
          <span>More</span>
        </div>
      </div>
      
      <div className="heatmap-grid">
        {grid.map((day, idx) => (
          <div
            key={idx}
            className={`heatmap-cell level-${getIntensity(day.count)} ${day.isToday ? 'is-today' : ''}`}
            title={`${day.label}: ${day.count} debates`}
          >
            {day.isToday && <div className="today-indicator" />}
          </div>
        ))}
      </div>
      
      <div className="heatmap-footer">
        Showing last 4 weeks of consistent training
      </div>
    </div>
  );
}
