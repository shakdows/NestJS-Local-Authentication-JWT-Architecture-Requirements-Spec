import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { UserStatus } from '../enums/user-status.enum.js';
import { UserRoleEntity } from './user-role.entity.js';

/** Persistence model for `users` (AUTH_DATABASE §3.1). Never leaves UsersRepository. */
@Entity({ name: 'users' })
@Unique('uq_users_email', ['email'])
@Check('ck_users_email_lowercase', `"email" = lower("email")`)
@Index('idx_users_status', ['status'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_users' })
  id: string;

  @Column({ name: 'email', type: 'varchar', length: 254 })
  email: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status',
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.user, {
    cascade: ['insert'],
  })
  roles: Relation<UserRoleEntity[]>;
}
