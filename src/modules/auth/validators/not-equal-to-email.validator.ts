import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/** FR-PWD-03: the password must not equal the (normalized) email, case-insensitively. */
export function NotEqualToEmail(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'notEqualToEmail',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: 'password must not be the same as the email', ...options },
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const email = (args.object as { email?: unknown }).email;
          if (typeof value !== 'string' || typeof email !== 'string') return true;
          return value.trim().toLowerCase() !== email.trim().toLowerCase();
        },
      },
    });
  };
}
