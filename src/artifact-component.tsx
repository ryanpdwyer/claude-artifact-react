import React, { useState, useEffect, useRef } from 'react';

const EquilibriumCalculator = () => {
  const R = 8.314; // Gas constant in J/mol·K
  const deltaH = -50000; // J/mol
  const [volume, setVolume] = useState(1.0);
  const [temperature, setTemperature] = useState(300);
  const [molsA, setMolsA] = useState(2);
  const [molsB, setMolsB] = useState(0.25);
  const [molsC, setMolsC] = useState(0.5);
  const [molsD, setMolsD] = useState(2);
  const [isEquilibrating, setIsEquilibrating] = useState(false);
  const [debugInfo, setDebugInfo] = useState({});
  const [debug, setDebug] = useState(false);
  const [step, setStep] = useState(0);
  const timeoutRef = useRef(null);

  // Calculate K based on temperature
  const K = Math.exp(-(deltaH/R) * (1/temperature - 1/300));

  // Calculate concentrations
  const concB = molsB / volume;
  const concC = molsC / volume;
  
  // Calculate Q = [C]²/[B]
  const Q = (concC * concC) / concB;

  // Calculate volume of solids
  const volumeA = molsA / 50; // L
  const volumeD = molsD / 40; // L
  
  // Available solution volume
  const Vsoln = volume - volumeA - volumeD;

  const addB = () => {
    setMolsB(prev => prev + 0.2);
  }

  const addC = () => {
    setMolsC(prev => prev + 0.2);
  }

  const removeB = () => {
    setMolsB(prev => prev*0.5)
  }

  const removeC = () => {
    setMolsC(prev => prev*0.5)
  }

  const performStep = () => {
    // Fixed time step
    const deltaTime = 0.1; // seconds
    
    // Rate constant
    const k = 0.5;
    
    // Calculate rates
    const dBdt = k * (concC * concC - concB * K);
    const dCdt = -2 * dBdt;
    
    // Calculate mole changes
    const dA = 3 * dBdt * Vsoln * deltaTime;
    const dB = dBdt * Vsoln * deltaTime;
    const dC = dCdt * Vsoln * deltaTime;
    const dD = -dBdt * Vsoln * deltaTime;
    
    // Update debug info
    setDebugInfo({
      dBdt: dBdt.toExponential(3),
      dCdt: dCdt.toExponential(3),
      dA: dA.toExponential(3),
      dB: dB.toExponential(3),
      dC: dC.toExponential(3),
      dD: dD.toExponential(3),
      deltaTime: deltaTime.toFixed(3),
      Vsoln: Vsoln.toFixed(3),
      concB: concB.toFixed(3),
      concC: concC.toFixed(3),
      K: K.toExponential(3),
      step: step
    });

    // Update moles
    setMolsA(prev => prev + dA);
    setMolsB(prev => prev + dB);
    setMolsC(prev => prev + dC);
    setMolsD(prev => prev + dD);
    
    setStep(prev => prev + 1);
  };

  useEffect(() => {
    if (isEquilibrating) {
      // Check if we should continue
      const currentQ = (concC * concC) / concB;
      if (Math.abs(Math.log(currentQ/K)) > 1e-4 && step < 200) {
        timeoutRef.current = setTimeout(performStep, 100); // 100ms delay between steps
      } else {
        setIsEquilibrating(false);
        setStep(0);
      }
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isEquilibrating, step, concB, concC, K]);

  const equilibrate = () => {
    setIsEquilibrating(true);
    setStep(0);
  };

  // Log scale for number line
  const logQ = Math.log10(Q);
  const logK = Math.log10(K);
  const logMin = -3;
  const logMax = 3;
  const qPos = ((logQ - logMin) / (logMax - logMin)) * 100;
  const kPos = ((logK - logMin) / (logMax - logMin)) * 100;

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-6">

<div className="flex">
    {/* Left column with sliders */}
    <div className="flex-1 space-y-4">
        <div>
          <label className="block mb-2">
            <input 
              type="checkbox" 
              checked={debug} 
              onChange={(e) => setDebug(e.target.checked)} 
              className="mr-2"
            />
            Enable Debug
          </label>
        </div>
        <div>
          <label className="block mb-2">
            Volume: {volume.toFixed(2)} L
          </label>
          <input 
            type="range" 
            min={0.1} 
            max={10} 
            step={0.1} 
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full"
            disabled={isEquilibrating}
          />
        </div>
        
        <div>
          <label className="block mb-2">
            Temperature: {temperature.toFixed(1)} K
          </label>
          <input 
            type="range" 
            min={100} 
            max={600} 
            step={1} 
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full"
            disabled={isEquilibrating}
          />
        </div>
</div>
 {/* Volume visualization with solids */}
<div className="ml-8 text-center">
  <div 
    className="mx-auto border-2 border-gray-400 rounded bg-blue-50 relative"
    style={{
      height: `${Math.min(volume * 40, 400)}px`,
      width: '100px'
    }}
  >
    <svg 
      width="100%" 
      height="100%" 
      className="absolute bottom-0 left-0"
    >
      {/* Solid A (green) */}
      <path 
        d={`M 0,${Math.min(volume * 40, 400)} 
            a ${Math.sqrt((volumeA * 3200) / Math.PI)},${Math.sqrt((volumeA * 3200) / Math.PI)} 0 0,1 ${100/2},0 
            L 0,${Math.min(volume * 40, 400)} Z`}
        fill="rgb(187 247 208)"  // light green
      />
      
      {/* Solid D (gray) */}
      <path 
        d={`M ${100},${Math.min(volume * 40, 400)} 
            a ${Math.sqrt((volumeD * 3200) / Math.PI)},${Math.sqrt((volumeD * 3200) / Math.PI)} 0 0,0 -${100/2},0 
            L ${100},${Math.min(volume * 40, 400)} Z`}
        fill="rgb(229 231 235)"  // light gray
      />
    </svg>
  </div>
  <div className="mt-2">Volume: {volume.toFixed(1)} L</div>
</div>
</div>

<div className="space-x-2">
      <button
          onClick={addB}
          disabled={isEquilibrating}
          className={`px-4 py-2 rounded ${isEquilibrating 
            ? 'bg-gray-400' 
            : Math.abs(Math.log(Q/K)) < 1e-4
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-blue-500 hover:bg-blue-600'
          } text-white`}
        >
          Add B(g)
        </button>

        <button
          onClick={removeB}
          disabled={isEquilibrating}
          className={`px-4 py-2 rounded ${isEquilibrating 
            ? 'bg-gray-400' 
            : Math.abs(Math.log(Q/K)) < 1e-4
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-blue-500 hover:bg-blue-600'
          } text-white`}
          >Remove B(g)</button>

          <button
            onClick={addC}
            disabled={isEquilibrating}
            className={`px-4 py-2 rounded ${isEquilibrating 
              ? 'bg-gray-400' 
              : Math.abs(Math.log(Q/K)) < 1e-4
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-blue-500 hover:bg-blue-600'
            } text-white`}
          >
            Add C(g)
          </button>

          <button
            onClick={removeC}
            disabled={isEquilibrating}
            className={`px-4 py-2 rounded ${isEquilibrating 
              ? 'bg-gray-400' 
              : Math.abs(Math.log(Q/K)) < 1e-4
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-blue-500 hover:bg-blue-600'
            } text-white`}
          >
            Remove C(g)
          </button>

        <button 
          onClick={equilibrate}
          disabled={isEquilibrating}
          className={`px-4 py-2 rounded ${isEquilibrating 
            ? 'bg-gray-400' 
            : Math.abs(Math.log(Q/K)) < 1e-4
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-blue-500 hover:bg-blue-600'
          } text-white`}
        >
          {isEquilibrating 
            ? `Equilibrating...` 
            : Math.abs(Math.log(Q/K)) < 1e-4
              ? 'At Equilibrium'
              : 'Equilibrate System'
          }
        </button>

        </div>


      {/* Debug Information */}
      {isEquilibrating && debug &&(
        <div className="bg-gray-100 p-4 rounded text-sm font-mono">
          <h3 className="font-bold mb-2">Debug Info (Step {step}):</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Rates (M/s):</div>
            <div>
              dB/dt: {debugInfo.dBdt}
              <br />
              dC/dt: {debugInfo.dCdt}
            </div>
            <div>Mole changes (mol):</div>
            <div>
              dA: {debugInfo.dA}
              <br />
              dB: {debugInfo.dB}
              <br />
              dC: {debugInfo.dC}
              <br />
              dD: {debugInfo.dD}
            </div>
            <div>Current state:</div>
            <div>
              [B]: {debugInfo.concB} M
              <br />
              [C]: {debugInfo.concC} M
              <br />
              K: {debugInfo.K}
              <br />
              Vsoln: {debugInfo.Vsoln} L
              <br />
              Δt: {debugInfo.deltaTime} s
            </div>
          </div>
        </div>
      )}

{/* Q calculation display */}
<div className="text-center mb-4" style={{paddingBottom: "16px"}}>
  <span className="mr-4">Q = [C]²/[B] = ({concC.toFixed(3)})²/{concB.toFixed(3)} = {Q.toExponential(2)}</span>
</div>

      {/* Q and K number line */}
      <div className="relative h-16 border-t-2 border-black mt-8">
        {/* K marker */}
        <div 
          className="absolute w-1 h-4 bg-blue-500"
          style={{ left: `${Math.min(Math.max(kPos, 0), 100)}%`, top: '-2px' ,
          transform: 'translateX(-50%)' /* Added this */
}}
        />
        <div 
          className="absolute text-blue-500 font-bold"
          style={{ left: `${Math.min(Math.max(kPos, 0), 100)}%`, top: '12px', transform: 'translateX(-50%)' }}
        >
          K={K.toExponential(2)}
        </div>

        {/* Q marker */}
        <div 
          className="absolute w-4 h-4 rounded-full bg-red-500"
          style={{ 
            left: `${Math.min(Math.max(qPos, 0), 100)}%`, 
            top: '-18px', 
            transform: 'translateX(-50%)'
          }}
        />
        <div 
          className="absolute text-red-500 font-bold"
          style={{ 
            left: `${Math.min(Math.max(qPos, 0), 100)}%`, 
            top: '-36px', 
            transform: 'translateX(-50%)'
          }}
        >
          Q={Q.toExponential(2)}
        </div>

        {/* Scale labels */}
        <div className="absolute left-0 top-4">10<sup>{logMin}</sup></div>
        <div className="absolute right-0 top-4">10<sup>{logMax}</sup></div>
      </div>

      {/* Current values table */}
      <table className="w-full mt-8 border-collapse border border-gray-300">
  <thead>
    <tr className="bg-gray-100">
      <th className="border p-2"></th>
      <th className="border p-2">3A(s)</th>
      <th className="border p-2">+</th>
      <th className="border p-2">B(g)</th>
      <th className="border p-2 text-center">⇌</th>
      <th className="border p-2">2C(g)</th>
      <th className="border p-2">+</th>
      <th className="border p-2">D(s)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="border p-2 font-medium">Moles</td>
      <td className="border p-2">{molsA.toFixed(3)}</td>
      <td className="border p-2"></td>
      <td className="border p-2">{molsB.toFixed(3)}</td>
      <td className="border p-2"></td>
      <td className="border p-2">{molsC.toFixed(3)}</td>
      <td className="border p-2"></td>
      <td className="border p-2">{molsD.toFixed(3)}</td>
    </tr>
    <tr>
      <td className="border p-2 font-medium">Concentration (M)</td>
      <td className="border p-2">50.000</td>
      <td className="border p-2"></td>
      <td className="border p-2">{concB.toFixed(3)}</td>
      <td className="border p-2"></td>
      <td className="border p-2">{concC.toFixed(3)}</td>
      <td className="border p-2"></td>
      <td className="border p-2">40.000</td>
    </tr>
    {/* <tr>
      <td className="border p-2 font-medium">Vol solid or solution (L)</td>
      <td className="border p-2">{volumeA.toFixed(4)}</td>
      <td className="border p-2"></td>
      <td className="border p-2">{Vsoln.toFixed(3)}</td>
      <td className="border p-2"></td>
      <td className="border p-2">{Vsoln.toFixed(3)}</td>
      <td className="border p-2"></td>
      <td className="border p-2">{volumeD.toFixed(4)}</td>
    </tr> */}
  </tbody>
</table>
      <p>The reaction is exothermic.</p>
      <div className="text-sm text-gray-600 mt-4">
        <p>Reaction: 3A(s) + B(g) ⇌ 2C(g) + D(s)</p>
        <p>ΔH = {deltaH} J/mol</p>
      </div>
    </div>
  );
};

export default EquilibriumCalculator;