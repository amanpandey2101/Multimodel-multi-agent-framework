import React, { useEffect, useState } from 'react';
import { LocalStorageUtil } from './localStorageUtil';

const App = () => {
  const [todos, setTodos] = useState([]);

  useEffect(() => {
    const storedTodos = LocalStorageUtil.getTodos();
    setTodos(storedTodos);
  }, []);

  const addTodo = (task) => {
    const newTodo = { id: Date.now(), task, completed: false };
    const updatedTodos = [...todos, newTodo];
    setTodos(updatedTodos);
    LocalStorageUtil.saveTodos(updatedTodos);
  };

  const removeTodo = (id) => {
    const updatedTodos = todos.filter(todo => todo.id !== id);
    setTodos(updatedTodos);
    LocalStorageUtil.saveTodos(updatedTodos);
  };

  const completeTodo = (id) => {
    const updatedTodos = todos.map(todo => 
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
    setTodos(updatedTodos);
    LocalStorageUtil.saveTodos(updatedTodos);
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">To-Do List</h1>
      <div className="flex mb-4">
        <input type="text" id="taskInput" className="border rounded p-2 flex-grow" />
        <button onClick={() => addTodo(document.getElementById('taskInput').value)} className="bg-blue-500 text-white rounded p-2 ml-2">Add</button>
      </div>
      <ul className="list-disc pl-5">
        {todos.map(todo => (
          <li key={todo.id} className={`flex justify-between items-center mb-2 ${todo.completed ? 'line-through text-gray-500' : ''}`}> 
            <span>{todo.task}</span>
            <div>
              <button onClick={() => completeTodo(todo.id)} className="bg-green-500 text-white rounded p-1 mr-2">Complete</button>
              <button onClick={() => removeTodo(todo.id)} className="bg-red-500 text-white rounded p-1">Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {todos.length === 0 && <p className="text-gray-500">No tasks available.</p>}
    </div>
  );
};

export default App;