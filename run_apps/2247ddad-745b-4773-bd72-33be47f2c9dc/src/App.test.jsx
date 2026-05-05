import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import App from './App';

/**
 * Unit tests for the Calculator component.
 */
describe('Calculator Component', () => {
    test('renders calculator and performs calculations', () => {
        const { getByText } = render(<App />);

        // Check initial state
        expect(getByText('0')).toBeInTheDocument();

        // Simulate button clicks
        fireEvent.click(getByText('1'));
        fireEvent.click(getByText('+'));
        fireEvent.click(getByText('2'));
        fireEvent.click(getByText('='));

        // Check result
        expect(getByText('3')).toBeInTheDocument();
    });

    test('clears input and result', () => {
        const { getByText } = render(<App />);

        // Simulate button clicks
        fireEvent.click(getByText('1'));
        fireEvent.click(getByText('+'));
        fireEvent.click(getByText('2'));
        fireEvent.click(getByText('='));
        expect(getByText('3')).toBeInTheDocument();

        // Clear the input
        fireEvent.click(getByText('C'));
        expect(getByText('0')).toBeInTheDocument();
    });
});
