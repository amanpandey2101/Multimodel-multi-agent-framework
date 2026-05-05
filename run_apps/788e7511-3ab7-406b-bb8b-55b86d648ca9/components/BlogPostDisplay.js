import React from 'react';
import blogPostManager from './BlogPostManager';

const BlogPostDisplay = () => {
    const [posts, setPosts] = React.useState([]);

    React.useEffect(() => {
        setPosts(blogPostManager.getAllPosts());
    }, []);

    return (
        <div>
            <h1>Blog Posts</h1>
            <ul>
                {posts.map(post => (
                    <li key={post.id}>
                        <h2>{post.title}</h2>
                        <p>{post.content.length > 100 ? post.content.substring(0, 100) + '...' : post.content}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default BlogPostDisplay;
