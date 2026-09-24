import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Role } from '../../roles/role.enum.js';
import { UserEntity } from './user.entity.js';

/** Persistence model for `user_roles` (AUTH_DATABASE §3.2). */
@Entity({ name: 'user_roles' })
@Index('idx_user_roles_role', ['role'])
export class UserRoleEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'pk_user_roles' })
  userId: string;

  @PrimaryColumn({
    name: 'role',
    type: 'enum',
    enum: Role,
    enumName: 'user_role',
    primaryKeyConstraintName: 'pk_user_roles',
  })
  role: Role;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => UserEntity, (user) => user.roles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_user_roles_user' })
  user: Relation<UserEntity>;
}
