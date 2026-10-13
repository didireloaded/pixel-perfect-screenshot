import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import "./themed-select.css";

interface Props {
  children: ReactNode;
  value?: string;
  defaultValue?: string | number | undefined;
  onValueChange?: (value: string) => void;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}
export function ThemedSelect({
  children,
  value,
  defaultValue,
  onValueChange,
  className = "",
  ...props
}: Props) {
  const options = Children.toArray(children).filter(
    isValidElement<{ value: string; children: ReactNode; disabled?: boolean }>,
  );
  const initial = String(defaultValue ?? options[0]?.props.value ?? "");
  const [local, setLocal] = useState(initial);
  const wrapper = useRef<HTMLSpanElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalHost(wrapper.current?.closest<HTMLElement>("dialog, .dark") ?? null);
  }, []);
  useEffect(() => {
    const form = wrapper.current?.closest("form");
    const reset = () => setLocal(initial);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initial]);
  const empty = options.find((option) => option.props.value === "");
  return (
    <span className="sl-select-wrap" ref={wrapper}>
      <Select.Root
        value={value ?? local}
        onValueChange={(next) => {
          const actual = next === "__sl_clear__" ? "" : next;
          setLocal(actual);
          onValueChange?.(actual);
        }}
        {...(props.name ? { name: props.name } : {})}
        required={!!props.required}
        disabled={!!props.disabled}
      >
        <Select.Trigger
          id={props.id}
          aria-label={props["aria-label"]}
          className={`sl-select-trigger ${className}`}
        >
          <Select.Value placeholder={empty?.props.children ?? "Choose…"} />
          <Select.Icon>
            <ChevronDown size={15} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal {...(portalHost ? { container: portalHost } : {})}>
          <Select.Content className="sl-select-menu" position="popper" sideOffset={6}>
            <Select.ScrollUpButton className="sl-select-scroll">↑</Select.ScrollUpButton>
            <Select.Viewport>
              {options.map((option) => (
                <Select.Item
                  key={option.props.value}
                  value={option.props.value || "__sl_clear__"}
                  disabled={!!option.props.disabled}
                  className="sl-select-option"
                >
                  <Select.ItemText>{option.props.children}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={15} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="sl-select-scroll">↓</Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </span>
  );
}
