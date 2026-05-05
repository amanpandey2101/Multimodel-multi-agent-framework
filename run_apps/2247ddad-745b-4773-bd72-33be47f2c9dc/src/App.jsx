import React, { useState } from 'react';

/**
 * Calculator component that handles user input and performs calculations.
 */
const App = () => {
    const [input, setInput] = useState('');
    const [result, setResult] = useState('');

    const handleButtonClick = (value) => {
        setInput((prev) => prev + value);
    };

    const calculateResult = () => {
        try {
            // Using a safer method to evaluate the expression
            const safeEval = (expr) => {
                // Validate the expression to prevent injection attacks
                if (/^[0-9+\-*/.() ]+$/.test(expr)) {
                    return new Function('return ' + expr)();
                } else {
                    throw new Error('Invalid expression');
                }
            };
            setResult(safeEval(input));
        } catch (error) {
            setResult('Error');
        }
    };

    const clearInput = () => {
        setInput('');
        setResult('');
    };

    return (
        <div>
            <h1>Calculator</h1>
            <div>{result || input || '0'}</div>
            <div>
                {[...Array(10).keys()].map((num) => (
                    <button key={num} onClick={() => handleButtonClick(num.toString())}>{num}</button>
                ))}
                <button onClick={() => handleButtonClick('+')}>+</button>
                <button onClick={() => handleButtonClick('-')}>-</button>
                <button onClick={() => handleButtonClick('*')}>*</button>
                <button onClick={() => handleButtonClick('/')}>/</button>
                <button onClick={calculateResult}>=</button>
                <button onClick={clearInput}>C</button>
            </div>
        </div>
    );
};

export default App;