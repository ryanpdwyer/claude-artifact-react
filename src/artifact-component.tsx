import React, { useState, useEffect, useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

const MLTrainingInterface = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  const [isModelReady, setIsModelReady] = useState(false);
  const [selectedModel, setSelectedModel] = useState('posenet');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [currentClass, setCurrentClass] = useState(1);
  const [numClasses, setNumClasses] = useState(3);
  const [isTrained, setIsTrained] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [status, setStatus] = useState('Choose a model to begin');
  const [cameraError, setCameraError] = useState(null);
  const [keypoints, setKeypoints] = useState([]);
  
  const [trainingData, setTrainingData] = useState({
    1: [], 2: [], 3: [], 4: [], 5: []
  });

  // Mock keypoint data for each model type
  const getMockKeypoints = () => {
    switch (selectedModel) {
      case 'posenet':
        return [
          { x: Math.random() * 640, y: Math.random() * 480, score: 0.9, part: "nose" },
          { x: Math.random() * 640, y: Math.random() * 480, score: 0.8, part: "leftEye" },
          { x: Math.random() * 640, y: Math.random() * 480, score: 0.8, part: "rightEye" },
          { x: Math.random() * 640, y: Math.random() * 480, score: 0.7, part: "leftShoulder" },
          { x: Math.random() * 640, y: Math.random() * 480, score: 0.7, part: "rightShoulder" }
        ];
      case 'handpose':
        return Array(21).fill(0).map((_, i) => ({
          x: Math.random() * 640,
          y: Math.random() * 480,
          score: 0.8,
          part: `finger${Math.floor(i/4)}_joint${i%4}`
        }));
      case 'facemesh':
        return Array(20).fill(0).map((_, i) => ({
          x: Math.random() * 640,
          y: Math.random() * 480,
          score: 0.9,
          part: `face${i}`
        }));
      default:
        return [];
    }
  };

  const drawKeypoints = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update mock keypoints
    const points = getMockKeypoints();
    setKeypoints(points);
    
    // Draw keypoints
    points.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255, 0, 0, ${point.score})`;
      ctx.fill();
      
      // Draw labels for PoseNet main points
      if (selectedModel === 'posenet' && ['nose', 'leftEye', 'rightEye'].includes(point.part)) {
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(point.part, point.x + 8, point.y);
      }
    });
    
    // Draw connections for handpose
    if (selectedModel === 'handpose') {
      for (let i = 0; i < points.length - 1; i++) {
        if (i % 4 !== 3) { // Connect within finger
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[i + 1].x, points[i + 1].y);
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
          ctx.stroke();
        }
      }
    }
    
    animationFrameRef.current = requestAnimationFrame(drawKeypoints);
  };

  // Initialize webcam
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setStatus('Camera ready');
        setCameraError(null);
      }
    } catch (err) {
      console.error('Error accessing webcam:', err);
      setCameraError(`Camera error: ${err.message}`);
      setStatus('Camera access denied');
    }
  };

  // Clean up webcam and animation frame
  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  useEffect(() => {
    startWebcam();
    return cleanup;
  }, []);

  useEffect(() => {
    if (isModelReady && !isLoading) {
      drawKeypoints();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isModelReady, isLoading, selectedModel]);

  const handleModelChange = (model) => {
    setSelectedModel(model);
    setIsModelReady(false);
    setIsLoading(true);
    setStatus(`Loading ${model}...`);
    setLoadingProgress(0);
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const recordSample = () => {
    setTrainingData(prev => ({
      ...prev,
      [currentClass]: [...prev[currentClass], 
        Array(10).fill(0).map(() => Math.random())
      ]
    }));
    setStatus(`Recorded sample for class ${currentClass}`);
  };

  const trainModel = () => {
    setStatus('Training...');
    setLoadingProgress(0);
    setIsLoading(true);
    
    const totalSamples = Object.values(trainingData)
      .reduce((sum, samples) => sum + samples.length, 0);
    const trainingTime = Math.min(2000 + (totalSamples * 100), 5000);
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += 2;
      if (progress <= 100) {
        setLoadingProgress(progress);
      }
    }, trainingTime / 50);

    setTimeout(() => {
      setIsLoading(false);
      setIsTrained(true);
      setStatus('Model trained!');
      clearInterval(interval);
    }, trainingTime);
  };

  const runModel = () => {
    const randomClass = Math.floor(Math.random() * numClasses) + 1;
    setPrediction(randomClass);
  };

  return (
    <div className="w-full max-w-4xl space-y-4">
      {/* Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle>ML Model Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Input Model:</label>
            <Select 
              value={selectedModel} 
              onValueChange={handleModelChange}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="posenet">PoseNet (~3s)</SelectItem>
                <SelectItem value="handpose">HandPose (~4s)</SelectItem>
                <SelectItem value="facemesh">FaceMesh (~5s)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">{loadingProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Number of Classes:</label>
            <Slider 
              value={[numClasses]}
              min={2}
              max={5}
              step={1}
              onValueChange={([value]) => setNumClasses(value)}
              className="w-full"
              disabled={isLoading}
            />
            <span className="text-sm">{numClasses} classes</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Camera Preview</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <div className="relative bg-slate-200 w-[640px] h-[480px] flex items-center justify-center overflow-hidden">
            {cameraError ? (
              <div className="text-center text-red-500">
                <Camera className="w-12 h-12 mx-auto mb-2" />
                {cameraError}
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
                />
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={480}
                  className="absolute inset-0 w-full h-full transform scale-x-[-1]"
                />
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-12 h-12 text-white animate-spin" />
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Training Interface */}
      <Card>
        <CardHeader>
          <CardTitle>Training Interface</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Select 
              value={currentClass.toString()} 
              onValueChange={(v) => setCurrentClass(parseInt(v))}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({length: numClasses}).map((_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    Class {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={recordSample}
              disabled={!isModelReady || isLoading}
              variant={isRecording ? "destructive" : "default"}
            >
              Record Sample
            </Button>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {Object.entries(trainingData).slice(0, numClasses).map(([classNum, samples]) => (
              <div key={classNum} className="text-center">
                <div className="font-medium">Class {classNum}</div>
                <div className="text-sm text-slate-500">{samples.length} samples</div>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <Button 
              onClick={trainModel} 
              disabled={!isModelReady || isLoading}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Training...</>
              ) : (
                'Train Model'
              )}
            </Button>
            <Button 
              onClick={runModel} 
              disabled={!isTrained || isLoading}
              variant="outline"
            >
              Run Model
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status and Results */}
      <Alert>
        <AlertDescription>
          Status: {status}
          {prediction && <div>Current Prediction: Class {prediction}</div>}
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default MLTrainingInterface;