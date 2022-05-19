import prisma from '../../prisma/prisma-client';
import HttpException from '../models/http-exception.model';
import { findUserIdByUsername } from './auth.service';
import profileSelector from '../selectors/profile.selector';
import { Profile } from '../models/user.model';
import profileMapper from '../mappers/profile.mapper';

export const getProfile = async (
  usernamePayload: string,
  usernameAuth?: string | undefined,
): Promise<Profile> => {
  const profile = await prisma.user.findUnique({
    where: {
      username: usernamePayload,
    },
    select: profileSelector,
  });

  if (!profile) {
    throw new HttpException(404, {});
  }

  return profileMapper(profile, usernameAuth);
};

export const followUser = async (
  usernamePayload: string,
  usernameAuth: string,
): Promise<Profile> => {
  const { id } = await findUserIdByUsername(usernameAuth);

  const profile = await prisma.user.update({
    where: {
      username: usernamePayload,
    },
    data: {
      followedBy: {
        connect: {
          id,
        },
      },
    },
    select: profileSelector,
  });

  return profileMapper(profile, usernameAuth);
};

export const unfollowUser = async (
  usernamePayload: string,
  usernameAuth: string,
): Promise<Profile> => {
  const { id } = await findUserIdByUsername(usernameAuth);

  const profile = await prisma.user.update({
    where: {
      username: usernamePayload,
    },
    data: {
      followedBy: {
        disconnect: {
          id,
        },
      },
    },
    select: profileSelector,
  });

  return profileMapper(profile, usernameAuth);
};
