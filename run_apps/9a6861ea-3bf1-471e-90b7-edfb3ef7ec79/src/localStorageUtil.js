export const LocalStorageUtil = {
  saveTodos(todos) {
    localStorage.setItem('todos', JSON.stringify(todos));
  },
  getTodos() {
    const todos = localStorage.getItem('todos');
    return todos ? JSON.parse(todos) : [];
  }
};