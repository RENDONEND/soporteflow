import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { Field, Input, Select, Textarea } from './ui'

type FormFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label: string
  control: Control<T>
  hint?: string
  error?: string
  as?: 'input' | 'textarea' | 'select'
  type?: string
  placeholder?: string
  options?: { value: string; label: string }[]
}

export function FormField<T extends FieldValues>({
  name,
  label,
  control,
  hint,
  error,
  as = 'input',
  type = 'text',
  placeholder,
  options,
}: FormFieldProps<T>) {
  return (
    <Field label={label} hint={hint}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => {
          if (as === 'textarea') {
            return <Textarea placeholder={placeholder} {...field} />
          }
          if (as === 'select') {
            return (
              <Select {...field}>
                <option value="">{placeholder ?? 'Seleccionar'}</option>
                {options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            )
          }
          return <Input type={type} placeholder={placeholder} {...field} />
        }}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </Field>
  )
}
