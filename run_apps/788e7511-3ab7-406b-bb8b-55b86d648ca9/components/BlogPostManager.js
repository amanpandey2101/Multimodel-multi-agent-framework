import { useState, useEffect } from 'react';

class BlogPostManager {
    constructor() {
        this.posts = this.getAllPosts();
    }

    createPost(title, content) {
        try {
            const newPost = { id: Date.now(), title, content };
            this.posts.push(newPost);
            localStorage.setItem('blogPosts', JSON.stringify(this.posts));
            return { success: true, message: 'Post created successfully.' };
        } catch (error) {
            console.error('Error creating post:', error);
            return { success: false, message: 'Failed to create post.' };
        }
    }

    editPost(id, title, content) {
        try {
            const index = this.posts.findIndex(post => post.id === id);
            if (index !== -1) {
                this.posts[index] = { id, title, content };
                localStorage.setItem('blogPosts', JSON.stringify(this.posts));
                return { success: true, message: 'Post updated successfully.' };
            }
            return { success: false, message: 'Post not found.' };
        } catch (error) {
            console.error('Error editing post:', error);
            return { success: false, message: 'Failed to edit post.' };
        }
    }

    deletePost(id) {
        try {
            this.posts = this.posts.filter(post => post.id !== id);
            localStorage.setItem('blogPosts', JSON.stringify(this.posts));
            return { success: true, message: 'Post deleted successfully.' };
        } catch (error) {
            console.error('Error deleting post:', error);
            return { success: false, message: 'Failed to delete post.' };
        }
    }

    getAllPosts() {
        try {
            const posts = localStorage.getItem('blogPosts');
            return posts ? JSON.parse(posts) : [];
        } catch (error) {
            console.error('Error retrieving posts:', error);
            return [];
        }
    }
}

const blogPostManager = new BlogPostManager();
export default blogPostManager;
