import os


def indent_lines(lines, num_spaces):
    indent = " " * num_spaces
    return [indent + line for line in lines]


def generate_regions_block(name_map):
    blocks = ["{"]
    for patch in name_map:
        block = f"""    {patch} {{   name {patch}; }}"""
        blocks.append(block)

    blocks.append("}")
    blocks = indent_lines(blocks, 8)

    text_str = "\n".join(blocks)
    text_str = "regions\n" + text_str
    return text_str


def generate_refinement_block(type_map):
    blocks = ["{"]
    for patch in type_map:
        # Check if patch should be a wall type
        if patch=="wall":
            block = f"""    {patch} {{   level (0 2);     patchInfo {{ type wall; }}}}"""
        else:
            block = f"""    {patch} {{   level (0 2);     patchInfo {{ type patch; }}}}"""
        blocks.append(block)
    blocks.append("}")
    blocks = indent_lines(blocks, 12)

    text_str = "regions" + "\n" + "\n".join(blocks)
    return text_str


def replace_in_file(input_path, output_path, str_replace_dict):
    with open(input_path, 'r', encoding='utf-8') as file:
        content = file.read()

    for old_str, new_str in str_replace_dict.items():
        content = content.replace(old_str, new_str)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as file:
        file.write(content)