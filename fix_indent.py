import sys

with open("backend/agent.py", "r") as f:
    lines = f.readlines()

for i in range(121, 234):
    if lines[i].strip() != "":
        lines[i] = "    " + lines[i]

with open("backend/agent.py", "w") as f:
    f.writelines(lines)
