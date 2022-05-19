import { CommentQueryResponse, CommentResponse } from '../models/comment.model';
import profileMapper from './profile.mapper';

const commentMapper = (comment: CommentQueryResponse, username?: string): CommentResponse => ({
  id: comment.id,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
  body: comment.body,
  author: profileMapper(comment.author, username),
});

export default commentMapper;
