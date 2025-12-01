add_executable (EDAN35_Assignment2)

target_sources (
	EDAN35_Assignment2
	PRIVATE
		[[assignment2.hpp]]
		[[assignment2.cpp]]
 "terrain_generation.cpp"  "parametric_shapes.cpp")
copy_dlls (EDAN35_Assignment2 "${CMAKE_CURRENT_BINARY_DIR}")

target_link_libraries (EDAN35_Assignment2 PRIVATE assignment_setup)

 
# Project
add_executable (EDAN35_Project)
target_sources (
	EDAN35_Project
	PRIVATE
		[[terrain_generation.hpp]]
		[[terrain_generation.cpp]]
  "parametric_shapes.cpp")	
target_link_libraries (
	EDAN35_Project
	PRIVATE assignment_setup parametric_shapes
)
copy_dlls (EDAN35_Project "${CMAKE_CURRENT_BINARY_DIR}")



install (TARGETS EDAN35_Assignment2 EDAN35_Project DESTINATION bin)


