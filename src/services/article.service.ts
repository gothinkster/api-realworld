import slugify from 'slugify';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/prisma-client';
import HttpException from '../models/http-exception.model';
import { findUserIdByUsername } from './auth.service';
import articleMapper from '../mappers/article.mapper';
import {
  ArticleCreatePayload,
  ArticleFindQuery,
  ArticleListResponse,
  ArticleQueryResponse,
  ArticleResponse,
} from '../models/article.model';
import articleSelector from '../selectors/article.selector';

const buildFindAllQuery = (
  query: ArticleFindQuery,
  username: string | undefined,
): Prisma.ArticleWhereInput => {
  const queries: any = [];
  const orAuthorQuery = [];
  const andAuthorQuery = [];

  orAuthorQuery.push({
    demo: {
      equals: true,
    },
  });

  if (username) {
    orAuthorQuery.push({
      username: {
        equals: username,
      },
    });
  }

  if ('author' in query) {
    andAuthorQuery.push({
      username: {
        equals: query.author,
      },
    });
  }

  const authorQuery = {
    author: {
      OR: orAuthorQuery,
      AND: andAuthorQuery,
    },
  };

  queries.push(authorQuery);

  if ('tag' in query) {
    queries.push({
      tagList: {
        some: {
          name: query.tag,
        },
      },
    });
  }

  if ('favorited' in query) {
    queries.push({
      favoritedBy: {
        some: {
          username: {
            equals: query.favorited,
          },
        },
      },
    });
  }

  return queries;
};

export const findManyArticles = async (
  query: Prisma.ArticleWhereInput,
  offset: number,
  limit: number,
): Promise<ArticleQueryResponse[]> =>
  prisma.article.findMany({
    where: { AND: query },
    orderBy: {
      createdAt: 'desc',
    },
    skip: offset || 0,
    take: limit || 10,
    select: articleSelector,
  });

export const getArticles = async (
  query: ArticleFindQuery,
  username?: string,
): Promise<ArticleListResponse> => {
  const queries = buildFindAllQuery(query, username);

  const articles = await findManyArticles(queries, Number(query.offset), Number(query.limit));

  return {
    articles: articles.map(article => articleMapper(article, username)),
    articlesCount: articles.length,
  };
};

export const getFeed = async (
  offset: number,
  limit: number,
  username: string,
): Promise<ArticleListResponse> => {
  const user = await findUserIdByUsername(username);

  const authorQuery = Prisma.validator<Prisma.ArticleWhereInput>()({
    author: {
      followedBy: { some: { id: user?.id } },
    },
  });

  const articles = await findManyArticles(authorQuery, offset, limit);

  return {
    articles: articles.map(article => articleMapper(article, username)),
    articlesCount: articles.length,
  };
};

export const createArticle = async (
  articlePayload: ArticleCreatePayload,
  username: string,
): Promise<ArticleResponse> => {
  const { title, description, body, tagList } = articlePayload;
  const tags = Array.isArray(tagList) ? tagList : [];

  if (!title) {
    throw new HttpException(422, { errors: { title: ["can't be blank"] } });
  }

  if (!description) {
    throw new HttpException(422, { errors: { description: ["can't be blank"] } });
  }

  if (!body) {
    throw new HttpException(422, { errors: { body: ["can't be blank"] } });
  }

  const user = await findUserIdByUsername(username);

  const slug = `${slugify(title)}-${user?.id}`;

  const existingTitle = await prisma.article.findUnique({
    where: {
      slug,
    },
    select: {
      slug: true,
    },
  });

  if (existingTitle) {
    throw new HttpException(422, { errors: { title: ['must be unique'] } });
  }

  const article = await prisma.article.create({
    data: {
      title,
      description,
      body,
      slug,
      tagList: {
        connectOrCreate: tags.map((tag: string) => ({
          create: { name: tag },
          where: { name: tag },
        })),
      },
      author: {
        connect: {
          id: user?.id,
        },
      },
    },
    select: articleSelector,
  });

  return articleMapper(article, username);
};

export const getArticle = async (slug: string, username?: string): Promise<ArticleResponse> => {
  const article = await prisma.article.findUnique({
    where: {
      slug,
    },
    select: articleSelector,
  });

  if (!article) {
    throw new HttpException(404, { errors: { article: ['not found'] } });
  }

  return articleMapper(article, username);
};

const disconnectArticlesTags = async (slug: string): Promise<void> => {
  await prisma.article.update({
    where: {
      slug,
    },
    data: {
      tagList: {
        set: [],
      },
    },
  });
};

export const updateArticle = async (
  article: ArticleCreatePayload,
  slug: string,
  username: string,
): Promise<ArticleResponse> => {
  let newSlug = null;
  const user = await findUserIdByUsername(username);

  const existingArticle = await prisma.article.findFirst({
    where: {
      slug,
    },
    select: {
      author: {
        select: {
          username: true,
        },
      },
    },
  });

  if (!existingArticle) {
    throw new HttpException(404, {});
  }

  if (existingArticle.author.username !== username) {
    throw new HttpException(403, {
      message: 'You are not authorized to update this article',
    });
  }

  if (article.title) {
    newSlug = `${slugify(article.title)}-${user?.id}`;

    if (newSlug !== slug) {
      const existingTitle = await prisma.article.findFirst({
        where: {
          slug: newSlug,
        },
        select: {
          slug: true,
        },
      });

      if (existingTitle) {
        throw new HttpException(422, { errors: { title: ['must be unique'] } });
      }
    }
  }

  const tagList =
    Array.isArray(article.tagList) && article.tagList?.length
      ? article.tagList.map((tag: string) => ({
          create: { name: tag },
          where: { name: tag },
        }))
      : [];

  await disconnectArticlesTags(slug);

  const updatedArticle = await prisma.article.update({
    where: {
      slug,
    },
    data: {
      ...(article.title ? { title: article.title } : {}),
      ...(article.body ? { body: article.body } : {}),
      ...(article.description ? { description: article.description } : {}),
      ...(newSlug ? { slug: newSlug } : {}),
      updatedAt: new Date(),
      tagList: {
        connectOrCreate: tagList,
      },
    },
    select: articleSelector,
  });

  return articleMapper(updatedArticle, username);
};

export const deleteArticle = async (slug: string, username: string): Promise<void> => {
  const article = await prisma.article.findFirst({
    where: {
      slug,
    },
    select: {
      author: {
        select: {
          username: true,
        },
      },
    },
  });

  if (!article) {
    throw new HttpException(404, {});
  }

  if (article.author.username !== username) {
    throw new HttpException(403, {
      message: 'You are not authorized to delete this article',
    });
  }
  await prisma.article.delete({
    where: {
      slug,
    },
  });
};

export const favoriteArticle = async (
  slugPayload: string,
  usernameAuth: string,
): Promise<ArticleResponse> => {
  const user = await findUserIdByUsername(usernameAuth);

  const article = await prisma.article.update({
    where: {
      slug: slugPayload,
    },
    data: {
      favoritedBy: {
        connect: {
          id: user?.id,
        },
      },
    },
    select: articleSelector,
  });

  return articleMapper(article, usernameAuth);
};

export const unfavoriteArticle = async (
  slugPayload: string,
  usernameAuth: string,
): Promise<ArticleResponse> => {
  const user = await findUserIdByUsername(usernameAuth);

  const article = await prisma.article.update({
    where: {
      slug: slugPayload,
    },
    data: {
      favoritedBy: {
        disconnect: {
          id: user?.id,
        },
      },
    },
    select: articleSelector,
  });

  return articleMapper(article, usernameAuth);
};
