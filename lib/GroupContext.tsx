import React, { createContext, useState, useContext } from 'react';

type Group = {
  id: string;
  name: string;
  invite_code: string;
};

type GroupContextType = {
  activeGroup: Group | null;
  setActiveGroup: (group: Group | null) => void;
};

const GroupContext = createContext<GroupContextType>({
  activeGroup: null,
  setActiveGroup: () => {},
});

export const GroupProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);

  return (
    <GroupContext.Provider value={{ activeGroup, setActiveGroup }}>
      {children}
    </GroupContext.Provider>
  );
};

export const useGroup = () => useContext(GroupContext);
