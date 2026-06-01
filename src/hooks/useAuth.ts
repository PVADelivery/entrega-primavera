import { useAuth as useContextAuth } from "@/contexts/AuthContext";

/**
 * HOOKS BASE
 */
export const useAuth = () => useContextAuth();

export const useUser = () => {
  const { user, profile, loading } = useContextAuth();
  return { user, profile, loading };
};

export const useSession = () => {
  const { session, loading } = useContextAuth();
  return { session, loading };
};

/**
 * AUTENTICAÇÃO
 */
export const useSignIn = () => {
  const { signIn } = useContextAuth();
  return { signIn };
};

export const useSignUp = () => {
  const { signUp } = useContextAuth();
  return { signUp };
};

export const useSignOut = () => {
  const { signOut } = useContextAuth();
  return { signOut };
};
