import { UserRoleEntity } from '../modules/users/entities/user-role.entity.js';
import { UserEntity } from '../modules/users/entities/user.entity.js';

/** Every entity, listed explicitly (works identically under Nest, the CLI and tests). */
export const ENTITIES = [UserEntity, UserRoleEntity];
