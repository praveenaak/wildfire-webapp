import React, { useState, useCallback, useEffect, useRef } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;

const layers = [
    {
      id: 'custom-layer',
      name: 'AQI Data',
      source: {
        type: 'vector',
        url: 'mapbox://pkulandh.split_2024-09-16_morning'
      },
      layer: {
        'id': 'custom-layer',
        'type': 'circle',
        'source-layer': 'split_20240916_morning_processed',
        'paint': {
            'circle-radius': [
            'interpolate',
            ['exponential', 1.5],
            ['zoom'],
            2, 8,
            3, 8,
            4, 8,
            5, 12,
            6, 14,
            10, 30,
            15, 40,
            20, 50
            ],
          'circle-color': [
            'case',
            ['all', 
              ['has', 'AQI'],
              ['>', ['to-number', ['get', 'AQI'], 0], 10]
            ],
            [
              'interpolate',
              ['linear'],
              ['to-number', ['get', 'AQI'], 0],
              0, 'rgba(0, 228, 0, 0.7)',    // Good
              50, 'rgba(255, 255, 0, 0.7)', // Moderate
              100, 'rgba(255, 126, 0, 0.7)', // Unhealthy for Sensitive Groups
              150, 'rgba(255, 0, 0, 0.7)',  // Unhealthy
              200, 'rgba(143, 63, 151, 0.7)', // Very Unhealthy
              300, 'rgba(126, 0, 35, 0.7)', // Hazardous
              500, 'rgba(126, 0, 35, 0.7)'  // Hazardous 
            ],
            'rgba(0, 0, 0, 0)'  
          ],
          'circle-blur': 0.5,
          'circle-opacity': [
            'case',
            ['all', 
              ['has', 'AQI'],
              ['>', ['to-number', ['get', 'AQI'], 0], 50] // Transparent for AQI values below 50
            ],
            0.8,
            0  
          ]
        }
      }
    },
  ];
  
const MapComponent = () => {
  const [viewport, setViewport] = useState({
    latitude: 40,
    longitude: -120,
    zoom: 5,
    minZoom: 2,
    maxZoom: 8,
  });

  const [activeLayers, setActiveLayers] = useState(['custom-layer']);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date('2024-09-15T18:00:00'));
  const [timeRange, setTimeRange] = useState({ 
    min: new Date('2024-09-15T18:00:00'), 
    max: new Date('2024-09-15T23:00:00') 
  });
  const [debugInfo, setDebugInfo] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    setTimeRange({
      min: new Date('2024-09-15T18:00:00'),
      max: new Date('2024-09-15T23:00:00')
    });
  }, []);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentTime(prevTime => {
          const newTime = new Date(prevTime.getTime() + 60 * 60 * 1000); // Advance by 1 hour
          if (newTime > timeRange.max) {
            setIsPlaying(false);
            return timeRange.min;
          }
          return newTime;
        });
      }, 500); // Update half a second
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isPlaying, timeRange]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const toggleLayer = (layerId) => {
    setActiveLayers(prev =>
      prev.includes(layerId)
        ? prev.filter(id => id !== layerId)
        : [...prev, layerId]
    );
  };

  const onError = useCallback(e => {
    setError(e.error.message || 'An unknown error occurred');
    console.error('Mapbox error:', e);
  }, []);

  const handleTimeChange = (event) => {
    const totalHours = parseInt(event.target.value);
    const newTime = new Date(timeRange.min);
    newTime.setHours(newTime.getHours() + totalHours);
    setCurrentTime(newTime);
  };

  const getLayerWithTimeFilter = (layer) => {
    const filterTime = currentTime.toISOString().slice(0, 19);
    console.log('Filtering for time:', filterTime);
    return {
      ...layer,
      layer: {
        ...layer.layer,
        filter: ['==', ['get', 'time'], filterTime]
      }
    };
  };

  const formatTimeLabel = (date) => {
    return date.toLocaleString([], { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const totalHours = Math.floor((timeRange.max - timeRange.min) / (1000 * 60 * 60));

  const onMapLoad = useCallback((event) => {
    const map = event.target;
    console.log('Map loaded');
    setDebugInfo('Map loaded');

    const updateDebugInfo = () => {
      const currentZoom = map.getZoom().toFixed(2);
      const features = map.queryRenderedFeatures({ layers: ['custom-layer'] });
      const featuresWithAQI = features.filter(f => f.properties && f.properties.AQI !== undefined);
      const featuresWithoutAQI = features.length - featuresWithAQI.length;
      const bounds = map.getBounds();
      setDebugInfo(`Current zoom level: ${currentZoom}\n` +
                   `Total visible features: ${features.length}\n` +
                   `Features with AQI: ${featuresWithAQI.length}\n` +
                   `Features without AQI: ${featuresWithoutAQI}\n` +
                   `Sample AQI values: ${featuresWithAQI.slice(0, 5).map(f => f.properties.AQI).join(', ')}\n` +
                   `Current bounds: ${JSON.stringify(bounds)}\n` +
                   `Current center: ${map.getCenter().lng.toFixed(4)}, ${map.getCenter().lat.toFixed(4)}`);
    };


    map.on('zoom', updateDebugInfo);
    map.on('moveend', updateDebugInfo);
    map.on('sourcedata', (e) => {
      if (e.isSourceLoaded && e.sourceId === 'custom-layer') {
        updateDebugInfo();
      }
    });
  }, []);

  const onViewportChange = useCallback((newViewport) => {
    setViewport(newViewport);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <div style={{ width: '250px', height: '100%', display: 'flex', flexDirection: 'column', background: '#f0f0f0' }}>
        <div style={{ padding: '10px', overflowY: 'auto', flex: 1 }}>
          <h3>Layers</h3>
          {layers.map(layer => (
            <div key={layer.id} style={{ marginBottom: '10px' }}>
              <input
                type="checkbox"
                id={layer.id}
                checked={activeLayers.includes(layer.id)}
                onChange={() => toggleLayer(layer.id)}
              />
              <label htmlFor={layer.id} style={{ marginLeft: '5px' }}>
                {layer.name}
              </label>
            </div>
          ))}
          <div style={{ marginTop: '20px' }}>
            <h4>Debug Info:</h4>
            <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '12px' }}>{debugInfo}</pre>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, position: 'relative' }}>
        <Map
            {...viewport}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/light-v10"
            mapboxAccessToken={MAPBOX_TOKEN}
            onError={onError}
            onLoad={onMapLoad}
            onMove={evt => onViewportChange(evt.viewState)}
            >
            {activeLayers.map(layerId => {
              const layer = layers.find(l => l.id === layerId);
              const filteredLayer = getLayerWithTimeFilter(layer);
              return (
                <Source key={filteredLayer.id} {...filteredLayer.source}>
                  <Layer {...filteredLayer.layer} />
                </Source>
              );
            })}
          </Map>
        </div>
        <div style={{ padding: '10px', background: '#f0f0f0' }}>
          <button onClick={togglePlay}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={totalHours}
            value={Math.floor((currentTime - timeRange.min) / (1000 * 60 * 60))}
            onChange={handleTimeChange}
            style={{ width: '100%' }}
          />
          <div style={{ textAlign: 'center' }}>
            Current Time: {formatTimeLabel(currentTime)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapComponent;