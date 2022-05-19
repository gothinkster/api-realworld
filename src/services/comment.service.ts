import prisma from '../../prisma/prisma-client';
import HttpException from '../models/http-exception.model';
import { findUserIdByUsername } from './auth.service';
import commentMapper from '../mappers/comment.mapper';
import { CommentResponse } from '../models/comment.model';
import commentSelector from '../selectors/comment.selector';

export const getCommentsByArticle = async (
  slug: string,
  username: string | undefined,
): Promise<CommentResponse[]> => {
  const queries = [];

  queries.push({
    author: {
      demo: true,
    },
  });

  if (username) {
    queries.push({
      author: {
        username,
      },
    });
  }

  const comments = await prisma.comment.findMany({
    where: {
      OR: queries,
      article: {
        slug,
      },
    },
    select: commentSelector,
  });

  return comments.map(comment => commentMapper(comment, username));
};

export const addComment = async (
  body: string,
  slug: string,
  username: string,
): Promise<CommentResponse> => {
  if (!body) {
    throw new HttpException(422, { errors: { body: ["can't be blank"] } });
  }

  const { id } = await findUserIdByUsername(username);

  const article = await prisma.article.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
    },
  });

  const comment = await prisma.comment.create({
    data: {
      body,
      article: {
        connect: {
          id: article?.id,
        },
      },
      author: {
        connect: {
          id,
        },
      },
    },
    select: commentSelector,
  });

  return commentMapper(comment, username);
};

export const deleteComment = async (id: number, username: string): Promise<void> => {
  const comment = await prisma.comment.findFirst({
    where: {
      id,
      author: {
        username,
      },
    },
    select: {
      author: {
        select: {
          username: true,
        },
      },
    },
  });

  if (!comment) {
    throw new HttpException(404, {});
  }

  if (comment.author.username !== username) {
    throw new HttpException(403, {
      message: 'You are not authorized to delete this comment',
    });
  }

  await prisma.comment.delete({
    where: {
      id,
    },
  });
};
