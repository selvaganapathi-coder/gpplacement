import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  formatAcademic,
  programOptions,
  type LevelType,
  type Program,
  type Section,
} from "@/lib/academic";

export type ManagedCohort = {
  program: Program;
  levelType: LevelType | null;
  level: number | null;
  section: Section | null;
  wholeProgram: boolean;
};

type ScopeResponse = {
  managedPrograms?: Program[];
  managedCohorts?: ManagedCohort[];
};

/**
 * Classes this staff may author tests for (course + year + section, or whole department).
 */
export function useStaffDepartmentScope() {
  const { user } = useAuth();
  const [managedPrograms, setManagedPrograms] = useState<Program[]>(() =>
    user?.role === "STAFF" && user.program ? [user.program] : []
  );
  const [managedCohorts, setManagedCohorts] = useState<ManagedCohort[]>([]);
  const [loaded, setLoaded] = useState(user?.role !== "STAFF");

  useEffect(() => {
    if (user?.role !== "STAFF") {
      setManagedPrograms([]);
      setManagedCohorts([]);
      setLoaded(true);
      return;
    }
    if (user.program) {
      setManagedPrograms([user.program]);
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<ScopeResponse>("/api/staff/dashboard-summary");
        if (cancelled) return;
        if (res.managedCohorts?.length) {
          setManagedCohorts(
            res.managedCohorts.map((c) => ({
              ...c,
              section: c.section ?? null,
            }))
          );
          setManagedPrograms([
            ...new Set(res.managedCohorts.map((c) => c.program)),
          ]);
        } else if (res.managedPrograms?.length) {
          setManagedPrograms(res.managedPrograms);
          setManagedCohorts(
            res.managedPrograms.map((program) => ({
              program,
              levelType: null,
              level: null,
              section: null,
              wholeProgram: true,
            }))
          );
        } else if (user.program) {
          setManagedPrograms([user.program]);
          setManagedCohorts([
            {
              program: user.program,
              levelType: null,
              level: null,
              section: null,
              wholeProgram: true,
            },
          ]);
        } else {
          setManagedPrograms([]);
          setManagedCohorts([]);
        }
      } catch {
        if (!cancelled && user.program) {
          setManagedPrograms([user.program]);
          setManagedCohorts([
            {
              program: user.program,
              levelType: null,
              level: null,
              section: null,
              wholeProgram: true,
            },
          ]);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user?.program]);

  const departmentLabel = useMemo(() => {
    const opts = programOptions();
    if (managedCohorts.length === 0) {
      if (managedPrograms.length === 0) return null;
      return managedPrograms
        .map((id) => opts.find((p) => p.id === id)?.label ?? id)
        .join(", ");
    }
    return managedCohorts
      .map((c) =>
        c.wholeProgram
          ? `${opts.find((p) => p.id === c.program)?.label ?? c.program} (all years)`
          : formatAcademic(c.program, c.levelType, c.level, c.section)
      )
      .join(", ");
  }, [managedCohorts, managedPrograms]);

  return {
    managedPrograms,
    managedCohorts,
    departmentLabel,
    loaded,
    hasDepartment: managedPrograms.length > 0 || managedCohorts.length > 0,
  };
}
